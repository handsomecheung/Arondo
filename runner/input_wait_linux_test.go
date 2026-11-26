//go:build linux

package main

import (
	"os/exec"
	"testing"
	"time"
)

func TestScriptInputWaitCyclesAfterSubmittedLines(t *testing.T) {
	tm := NewTaskManager()
	changes := make(chan bool, 4)
	done := make(chan int, 1)
	_, err := tm.Spawn(SpawnOptions{
		TaskID:  "input-wait-cycle",
		Command: "bash",
		Args:    []string{"-c", "read first; read second"},
		OnExit:  func(code int) { done <- code },
		OnInputWaitChange: func(waiting bool) {
			changes <- waiting
		},
	})
	if err != nil {
		t.Fatalf("Spawn returned error: %v", err)
	}

	waitForInputState(t, changes, true)
	if err := tm.WritePTY("input-wait-cycle", []byte("first\n")); err != nil {
		t.Fatalf("WritePTY first input: %v", err)
	}
	waitForInputState(t, changes, false)
	waitForInputState(t, changes, true)
	if err := tm.WritePTY("input-wait-cycle", []byte("second\n")); err != nil {
		t.Fatalf("WritePTY second input: %v", err)
	}
	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for script to exit")
	}
}

func waitForInputState(t *testing.T, changes <-chan bool, want bool) {
	t.Helper()
	select {
	case got := <-changes:
		if got != want {
			t.Fatalf("input wait state = %t, want %t", got, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for input wait state %t", want)
	}
}

func TestScriptInputWaitDetectedForJobControlledForegroundCommand(t *testing.T) {
	if _, err := exec.LookPath("zsh"); err != nil {
		t.Skip("zsh is not installed")
	}
	tm := NewTaskManager()
	changes := make(chan bool, 4)
	done := make(chan int, 1)
	_, err := tm.Spawn(SpawnOptions{
		TaskID:  "input-wait-job-control",
		Command: "zsh",
		Args:    []string{"-ic", "cat"},
		OnExit:  func(code int) { done <- code },
		OnInputWaitChange: func(waiting bool) {
			changes <- waiting
		},
	})
	if err != nil {
		t.Fatalf("Spawn returned error: %v", err)
	}

	waitForInputState(t, changes, true)
	if err := tm.WritePTY("input-wait-job-control", []byte("hello\n")); err != nil {
		t.Fatalf("WritePTY input: %v", err)
	}
	waitForInputState(t, changes, false)
	if err := tm.WritePTY("input-wait-job-control", []byte{4}); err != nil {
		t.Fatalf("WritePTY EOF: %v", err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for script to exit")
	}
}
