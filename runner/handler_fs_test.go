package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleFsMkdtempSkipsExcludedAndBusyDirs(t *testing.T) {
	tm := NewTaskManager()
	h := &Handler{
		taskManager: tm,
	}

	baseTmp := os.TempDir()
	dir0 := filepath.Join(baseTmp, "arondo-tempdir-0000")
	dir1 := filepath.Join(baseTmp, "arondo-tempdir-0001")

	// Ensure cleanup
	_ = os.RemoveAll(dir0)
	_ = os.RemoveAll(dir1)
	defer func() {
		_ = os.RemoveAll(dir0)
		_ = os.RemoveAll(dir1)
	}()

	// Create empty dir0 and dir1
	if err := os.MkdirAll(dir0, 0o755); err != nil {
		t.Fatalf("failed to create dir0: %v", err)
	}
	if err := os.MkdirAll(dir1, 0o755); err != nil {
		t.Fatalf("failed to create dir1: %v", err)
	}

	payloadBytes, _ := json.Marshal(fsMkdtempRequest{
		ExcludePaths: []string{dir0},
	})
	msg := &Message{
		ID:      "test-1",
		Type:    TypeRequest,
		Method:  "fs.mkdtemp",
		Payload: payloadBytes,
	}

	req, err := parsePayload[fsMkdtempRequest](msg)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if len(req.ExcludePaths) != 1 || req.ExcludePaths[0] != dir0 {
		t.Fatalf("expected ExcludePaths to contain dir0, got %+v", req.ExcludePaths)
	}

	_ = h
}
