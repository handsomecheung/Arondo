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

func TestHandleFsMkdtempPurposes(t *testing.T) {
	payloadBytes, _ := json.Marshal(fsMkdtempRequest{
		Purpose: "automation-session",
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
	if req.Purpose != "automation-session" {
		t.Fatalf("expected Purpose to be automation-session, got %q", req.Purpose)
	}
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
