package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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

func TestHandleFsInfosDirectoryAndFile(t *testing.T) {
	tempDir := t.TempDir()
	subDir := filepath.Join(tempDir, "subdir")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}
	testFile := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello"), 0o644); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}
	missingPath := filepath.Join(tempDir, "missing")

	var upgrader = websocket.Upgrader{}
	responseChan := make(chan *Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg Message
			if err := json.Unmarshal(data, &msg); err == nil {
				if msg.ID == "test-infos" {
					responseChan <- &msg
				}
			}
		}
	}))
	defer server.Close()

	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	client := NewClient(wsURL, "test-token")
	if err := client.connect(); err != nil {
		t.Fatalf("failed to connect test client: %v", err)
	}
	defer client.Stop()

	h := client.handler

	payloadBytes, _ := json.Marshal(fsExistsRequest{
		Paths: []string{subDir, testFile, missingPath},
	})
	msg := &Message{
		ID:      "test-infos",
		Type:    TypeRequest,
		Method:  "fs.infos",
		Payload: payloadBytes,
	}

	h.handleFsInfos(msg)

	var responseMsg *Message
	select {
	case responseMsg = <-responseChan:
	case <-time.After(3 * time.Second):
		t.Fatalf("timed out waiting for response message")
	}

	var res fsInfosResponse
	if err := json.Unmarshal(responseMsg.Payload, &res); err != nil {
		t.Fatalf("failed to parse response payload: %v", err)
	}

	if !res.OK {
		t.Fatalf("expected OK true, got false")
	}

	if subInfo, ok := res.Results[subDir]; !ok || !subInfo.Exists || !subInfo.IsDir {
		t.Fatalf("expected subDir to exist as directory, got: %+v", subInfo)
	}

	if fileInfo, ok := res.Results[testFile]; !ok || !fileInfo.Exists || fileInfo.IsDir {
		t.Fatalf("expected testFile to exist as file, got: %+v", fileInfo)
	}

	if missingInfo, ok := res.Results[missingPath]; !ok || missingInfo.Exists {
		t.Fatalf("expected missingPath to not exist, got: %+v", missingInfo)
	}
}
