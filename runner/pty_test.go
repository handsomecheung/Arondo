package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestExtractAgyConversationIDUsesDedicatedLogFile(t *testing.T) {
	logFile, err := os.CreateTemp(t.TempDir(), "agy-*.log")
	if err != nil {
		t.Fatalf("create log file: %v", err)
	}
	defer logFile.Close()

	const conversationID = "a1b2c3d4-e5f6-4789-abcd-0123456789ab"
	if _, err := logFile.WriteString("I0820 19:53:40.909542       1 server.go:1074] Created conversation " + conversationID + "\n"); err != nil {
		t.Fatalf("write log file: %v", err)
	}
	if got := extractAgyConversationID(logFile.Name()); got != conversationID {
		t.Fatalf("conversation ID = %q, want %q", got, conversationID)
	}
}

func TestSpawnPipedSeparatesStdoutAndStderr(t *testing.T) {
	tm := NewTaskManager()
	done := make(chan int, 1)
	var stdout strings.Builder
	var stderr strings.Builder

	pid, err := tm.SpawnPiped(SpawnPipedOptions{
		TaskID:  "test-piped",
		Command: "bash",
		Args:    []string{"-c", `printf "out"; printf "err" >&2`},
		OnStdout: func(data []byte) {
			stdout.Write(data)
		},
		OnStderr: func(data []byte) {
			stderr.Write(data)
		},
		OnExit: func(exitCode int) {
			done <- exitCode
		},
	})
	if err != nil {
		t.Fatalf("SpawnPiped returned error: %v", err)
	}
	if pid <= 0 {
		t.Fatalf("expected a positive pid, got %d", pid)
	}

	select {
	case exitCode := <-done:
		if exitCode != 0 {
			t.Fatalf("expected exit code 0, got %d", exitCode)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for piped task to exit")
	}

	if got := stdout.String(); got != "out" {
		t.Fatalf("stdout = %q, want %q", got, "out")
	}
	if got := stderr.String(); got != "err" {
		t.Fatalf("stderr = %q, want %q", got, "err")
	}
}

func TestKillTerminatesDetachedChildProcesses(t *testing.T) {
	tm := NewTaskManager()
	done := make(chan int, 1)

	pidFile := filepath.Join(t.TempDir(), "child.pid")
	cmdScript := fmt.Sprintf(`python3 -c '
import subprocess, time, sys
p = subprocess.Popen(["sleep", "30"], start_new_session=True)
with open(%q, "w") as f:
    f.write(str(p.pid))
time.sleep(30)
'`, pidFile)

	_, err := tm.SpawnPiped(SpawnPipedOptions{
		TaskID:  "test-kill-detached",
		Command: "bash",
		Args:    []string{"-c", cmdScript},
		OnExit: func(exitCode int) {
			done <- exitCode
		},
	})
	if err != nil {
		t.Fatalf("SpawnPiped failed: %v", err)
	}

	var childPid int
	for i := 0; i < 50; i++ {
		time.Sleep(50 * time.Millisecond)
		data, err := os.ReadFile(pidFile)
		if err == nil && len(data) > 0 {
			childPid, _ = strconv.Atoi(strings.TrimSpace(string(data)))
			if childPid > 0 {
				break
			}
		}
	}
	if childPid <= 0 {
		t.Fatal("failed to get child pid from spawned process")
	}

	if err := syscall.Kill(childPid, 0); err != nil {
		t.Fatalf("child process %d should be running initially", childPid)
	}

	if err := tm.Kill("test-kill-detached", syscall.SIGTERM); err != nil {
		t.Fatalf("Kill returned error: %v", err)
	}

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for task to exit after Kill")
	}

	time.Sleep(200 * time.Millisecond)
	if err := syscall.Kill(childPid, 0); err == nil {
		_ = syscall.Kill(childPid, syscall.SIGKILL)
		t.Fatalf("detached child process %d is still running after task kill", childPid)
	}
}

func TestKillEscalatesToSigkillWhenSigtermIgnored(t *testing.T) {
	tm := NewTaskManager()
	done := make(chan int, 1)

	cmdScript := `python3 -c '
import signal, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
time.sleep(30)
'`

	_, err := tm.SpawnPiped(SpawnPipedOptions{
		TaskID:  "test-kill-ignored",
		Command: "bash",
		Args:    []string{"-c", cmdScript},
		OnExit: func(exitCode int) {
			done <- exitCode
		},
	})
	if err != nil {
		t.Fatalf("SpawnPiped failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)

	if err := tm.Kill("test-kill-ignored", syscall.SIGTERM); err != nil {
		t.Fatalf("Kill returned error: %v", err)
	}

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for task to be killed by escalated SIGKILL")
	}
}

func TestScriptInputWaitPasswordPromptDetection(t *testing.T) {
	tm := NewTaskManager()
	changes := make(chan bool, 4)
	done := make(chan int, 1)

	_, err := tm.Spawn(SpawnOptions{
		TaskID:  "prompt-input-wait",
		Command: "bash",
		Args:    []string{"-c", `printf "[sudo] password for testuser: "; read pass; echo "success: $pass"`},
		OnExit:  func(code int) { done <- code },
		OnInputWaitChange: func(waiting bool) {
			changes <- waiting
		},
	})
	if err != nil {
		t.Fatalf("Spawn returned error: %v", err)
	}

	// Should transition to waiting state
	select {
	case waiting := <-changes:
		if !waiting {
			t.Fatalf("expected waiting=true, got %v", waiting)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for prompt input wait state")
	}

	// Send input
	if err := tm.WritePTY("prompt-input-wait", []byte("secret123\n")); err != nil {
		t.Fatalf("WritePTY returned error: %v", err)
	}

	// Should transition back to waiting=false
	select {
	case waiting := <-changes:
		if waiting {
			t.Fatalf("expected waiting=false, got %v", waiting)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for prompt input wait false")
	}

	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for task to exit")
	}
}

