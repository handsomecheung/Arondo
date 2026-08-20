package main

import (
	"os"
	"strings"
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
