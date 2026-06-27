package main

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

const maxBufferSize = 100 * 1024 // 100KB scrollback

type TaskInfo struct {
	ID       string
	Done     bool
	ExitCode int
}

type task struct {
	id           string
	cmd          *exec.Cmd
	ptyFile      *os.File
	buffer       []byte
	done         bool
	exitCode     int
	mu           sync.Mutex
	onData       func([]byte)
	onExit       func(int)
	isRestarting bool
	procDoneC    chan struct{}
}

type TaskManager struct {
	tasks map[string]*task
	mu    sync.RWMutex
}

func NewTaskManager() *TaskManager {
	return &TaskManager{
		tasks: make(map[string]*task),
	}
}

type SpawnOptions struct {
	TaskID  string
	Command string
	Args    []string
	WorkDir string
	Env     []string
	Cols    uint16
	Rows    uint16
	OnData  func(data []byte)
	OnExit  func(exitCode int)
}

func (tm *TaskManager) Spawn(opts SpawnOptions) (int, error) {
	tm.mu.Lock()
	if _, exists := tm.tasks[opts.TaskID]; exists {
		tm.mu.Unlock()
		return 0, fmt.Errorf("task %s already exists", opts.TaskID)
	}

	cmd := execCommand(opts.Command, opts.Args...)
	cmd.Dir = opts.WorkDir
	if len(opts.Env) > 0 {
		cmd.Env = append(os.Environ(), opts.Env...)
	} else {
		cmd.Env = os.Environ()
	}

	t := &task{
		id:        opts.TaskID,
		cmd:       cmd,
		onData:    opts.OnData,
		onExit:    opts.OnExit,
		procDoneC: make(chan struct{}),
	}
	tm.tasks[opts.TaskID] = t
	tm.mu.Unlock()

	if err := tm.launchProcess(t, opts.Cols, opts.Rows); err != nil {
		tm.mu.Lock()
		delete(tm.tasks, opts.TaskID)
		tm.mu.Unlock()
		return 0, err
	}
	return t.cmd.Process.Pid, nil
}

// launchProcess starts a new process with a PTY for the given task.
// The task must already have cmd, onData, onExit, and procDoneC set.
func (tm *TaskManager) launchProcess(t *task, cols, rows uint16) error {
	winSize := &pty.Winsize{Cols: cols, Rows: rows}
	if winSize.Cols == 0 {
		winSize.Cols = 120
	}
	if winSize.Rows == 0 {
		winSize.Rows = 30
	}

	ptmx, err := pty.StartWithSize(t.cmd, winSize)
	if err != nil {
		return fmt.Errorf("pty start: %w", err)
	}
	t.ptyFile = ptmx

	// Capture per-launch values so the goroutine is not affected by future restarts.
	procDoneC := t.procDoneC

	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				data := make([]byte, n)
				copy(data, buf[:n])

				t.mu.Lock()
				t.buffer = append(t.buffer, data...)
				if len(t.buffer) > maxBufferSize {
					t.buffer = t.buffer[len(t.buffer)-maxBufferSize:]
				}
				onData := t.onData
				t.mu.Unlock()

				if onData != nil {
					onData(data)
				}
			}
			if err != nil {
				break
			}
		}

		exitCode := 0
		if err := t.cmd.Wait(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}

		t.mu.Lock()
		t.done = true
		t.exitCode = exitCode
		isRestarting := t.isRestarting
		onExit := t.onExit
		t.mu.Unlock()

		ptmx.Close()

		// Signal that this process instance is finished.
		close(procDoneC)

		if !isRestarting {
			if onExit != nil {
				onExit(exitCode)
			}
			tm.mu.Lock()
			delete(tm.tasks, t.id)
			tm.mu.Unlock()
		}
	}()

	return nil
}

// Restart kills the running process for taskID and respawns it with the given
// command, all within the same task slot. The server never sees an exec.exit
// for the intermediate kill — only for the eventual exit of the new process.
func (tm *TaskManager) Restart(taskID, command, workDir string, cols, rows uint16) (int, error) {
	tm.mu.RLock()
	t, ok := tm.tasks[taskID]
	tm.mu.RUnlock()
	if !ok {
		return 0, fmt.Errorf("task %s not found", taskID)
	}

	// Mark as restarting and send SIGTERM to the current process.
	t.mu.Lock()
	if t.done {
		t.mu.Unlock()
		return 0, fmt.Errorf("task %s already exited", taskID)
	}
	t.isRestarting = true
	procDoneC := t.procDoneC
	if t.cmd.Process != nil {
		t.cmd.Process.Signal(syscall.SIGTERM)
	}
	t.mu.Unlock()

	select {
	case <-procDoneC:
		// Exited cleanly after SIGTERM.
	case <-time.After(5 * time.Second):
		// Escalate to SIGKILL.
		t.mu.Lock()
		if !t.done && t.cmd.Process != nil {
			t.cmd.Process.Signal(syscall.SIGKILL)
		}
		t.mu.Unlock()
		select {
		case <-procDoneC:
		case <-time.After(2 * time.Second):
			return 0, fmt.Errorf("task %s failed to stop within timeout", taskID)
		}
	}

	separator := []byte("\r\n\033[90m─── restarting ───\033[0m\r\n\r\n")
	t.mu.Lock()
	t.buffer = append(t.buffer, separator...)
	if len(t.buffer) > maxBufferSize {
		t.buffer = t.buffer[len(t.buffer)-maxBufferSize:]
	}
	onData := t.onData
	t.mu.Unlock()
	if onData != nil {
		onData(separator)
	}

	cmd := execCommand("bash", "-c", command)
	cmd.Dir = workDir
	cmd.Env = os.Environ()

	t.mu.Lock()
	t.cmd = cmd
	t.done = false
	t.exitCode = 0
	t.isRestarting = false
	t.procDoneC = make(chan struct{})
	t.mu.Unlock()

	if err := tm.launchProcess(t, cols, rows); err != nil {
		// Launch failed — fire a terminal exit so the server cleans up the task.
		t.mu.Lock()
		t.done = true
		onExit := t.onExit
		t.mu.Unlock()
		if onExit != nil {
			onExit(1)
		}
		tm.mu.Lock()
		delete(tm.tasks, t.id)
		tm.mu.Unlock()
		return 0, err
	}

	return t.cmd.Process.Pid, nil
}

func (tm *TaskManager) WritePTY(taskID string, data []byte) error {
	tm.mu.RLock()
	t, ok := tm.tasks[taskID]
	tm.mu.RUnlock()
	if !ok {
		return fmt.Errorf("task %s not found", taskID)
	}
	if t.ptyFile == nil {
		return fmt.Errorf("task %s has no PTY", taskID)
	}
	_, err := t.ptyFile.Write(data)
	return err
}

func (tm *TaskManager) ResizePTY(taskID string, cols, rows uint16) error {
	tm.mu.RLock()
	t, ok := tm.tasks[taskID]
	tm.mu.RUnlock()
	if !ok {
		return fmt.Errorf("task %s not found", taskID)
	}
	if t.ptyFile == nil {
		return fmt.Errorf("task %s has no PTY", taskID)
	}
	return pty.Setsize(t.ptyFile, &pty.Winsize{Cols: cols, Rows: rows})
}

func (tm *TaskManager) Kill(taskID string, signal syscall.Signal) error {
	tm.mu.RLock()
	t, ok := tm.tasks[taskID]
	tm.mu.RUnlock()
	if !ok {
		return fmt.Errorf("task %s not found", taskID)
	}
	t.mu.Lock()
	done := t.done
	t.mu.Unlock()
	if done {
		return fmt.Errorf("task %s already exited", taskID)
	}
	if t.cmd.Process == nil {
		return fmt.Errorf("task %s process not started", taskID)
	}
	return t.cmd.Process.Signal(signal)
}

func (tm *TaskManager) GetBuffer(taskID string) ([]byte, error) {
	tm.mu.RLock()
	t, ok := tm.tasks[taskID]
	tm.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("task %s not found", taskID)
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	buf := make([]byte, len(t.buffer))
	copy(buf, t.buffer)
	return buf, nil
}

func (tm *TaskManager) ListTasks() []TaskInfo {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	var infos []TaskInfo
	for _, t := range tm.tasks {
		t.mu.Lock()
		infos = append(infos, TaskInfo{
			ID:       t.id,
			Done:     t.done,
			ExitCode: t.exitCode,
		})
		t.mu.Unlock()
	}
	return infos
}

func (tm *TaskManager) Cleanup(taskID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if t, ok := tm.tasks[taskID]; ok {
		if t.ptyFile != nil {
			t.ptyFile.Close()
		}
		delete(tm.tasks, taskID)
	}
}
