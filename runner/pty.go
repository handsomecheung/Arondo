package main

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

const maxBufferSize = 100 * 1024 // 100KB scrollback

type TaskInfo struct {
	ID       string
	Done     bool
	ExitCode int
}

type task struct {
	id       string
	cmd      *exec.Cmd
	ptyFile  *os.File // nil for non-PTY (agent) tasks
	buffer   []byte
	done     bool
	exitCode int
	mu       sync.Mutex
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

	cmd := exec.Command(opts.Command, opts.Args...)
	cmd.Dir = opts.WorkDir
	if len(opts.Env) > 0 {
		cmd.Env = append(os.Environ(), opts.Env...)
	} else {
		cmd.Env = os.Environ()
	}

	t := &task{id: opts.TaskID, cmd: cmd}
	tm.tasks[opts.TaskID] = t
	tm.mu.Unlock()

	if err := tm.startWithPTY(t, opts); err != nil {
		return 0, err
	}
	return t.cmd.Process.Pid, nil
}

func (tm *TaskManager) startWithPTY(t *task, opts SpawnOptions) error {
	winSize := &pty.Winsize{
		Cols: opts.Cols,
		Rows: opts.Rows,
	}
	if winSize.Cols == 0 {
		winSize.Cols = 120
	}
	if winSize.Rows == 0 {
		winSize.Rows = 30
	}

	ptmx, err := pty.StartWithSize(t.cmd, winSize)
	if err != nil {
		tm.mu.Lock()
		delete(tm.tasks, t.id)
		tm.mu.Unlock()
		return fmt.Errorf("pty start: %w", err)
	}
	t.ptyFile = ptmx

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
				t.mu.Unlock()

				if opts.OnData != nil {
					opts.OnData(data)
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
		t.mu.Unlock()

		if t.ptyFile != nil {
			t.ptyFile.Close()
		}

		if opts.OnExit != nil {
			opts.OnExit(exitCode)
		}

		tm.mu.Lock()
		delete(tm.tasks, t.id)
		tm.mu.Unlock()
	}()

	return nil
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
