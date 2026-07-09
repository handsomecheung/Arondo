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

func TestAgentQuotas(t *testing.T) {
	// Set up mock bin directory in PATH
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}
	// The path to mock bin directories
	mockAgyBinDir := filepath.Clean(filepath.Join(wd, "../tests/mocks/bin/agy"))
	mockClaudeBinDir := filepath.Clean(filepath.Join(wd, "../tests/mocks/bin/claude"))
	originalPath := os.Getenv("PATH")
	err = os.Setenv("PATH", mockAgyBinDir+":"+mockClaudeBinDir+":"+originalPath)
	if err != nil {
		t.Fatalf("failed to set PATH: %v", err)
	}
	defer os.Setenv("PATH", originalPath)

	// Set up websocket server to capture messages sent by client
	var upgrader = websocket.Upgrader{}
	quotaUpdates := make(chan *Message, 10)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg Message
			if err := json.Unmarshal(message, &msg); err == nil {
				if msg.Method == "quota.update" {
					quotaUpdates <- &msg
				}
			}
		}
	}))
	defer server.Close()

	// Convert http:// to ws://
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)

	// Initialize runner client
	client := NewClient(wsURL, "test-token")
	err = client.connect()
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer client.Stop()

	// 1. Fetch Agi/Agy Quota
	t.Run("AgyQuota", func(t *testing.T) {
		go fetchAgyQuota(client)

		select {
		case msg := <-quotaUpdates:
			if msg.Method != "quota.update" {
				t.Fatalf("expected quota.update event, got %s", msg.Method)
			}
			var payload struct {
				Agent string         `json:"agent"`
				Quota map[string]any `json:"quota"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				t.Fatalf("failed to unmarshal payload: %v", err)
			}
			if payload.Agent != "agy" {
				t.Fatalf("expected agent agy, got %s", payload.Agent)
			}
			account, _ := payload.Quota["Account"].(string)
			if account != "arondo@gmail.com" {
				t.Fatalf("expected account arondo@gmail.com, got %s", account)
			}
			plan, _ := payload.Quota["Plan"].(string)
			if plan != "Google AI Pro" {
				t.Fatalf("expected plan Google AI Pro, got %s", plan)
			}
		case <-time.After(35 * time.Second):
			t.Fatal("timed out waiting for agy quota.update")
		}
	})

	// 2. Fetch Claude Quota
	t.Run("ClaudeQuota", func(t *testing.T) {
		go fetchClaudeQuota(client)

		select {
		case msg := <-quotaUpdates:
			if msg.Method != "quota.update" {
				t.Fatalf("expected quota.update event, got %s", msg.Method)
			}
			var payload struct {
				Agent string         `json:"agent"`
				Quota map[string]any `json:"quota"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				t.Fatalf("failed to unmarshal payload: %v", err)
			}
			if payload.Agent != "claude" {
				t.Fatalf("expected agent claude, got %s", payload.Agent)
			}
			account, _ := payload.Quota["Account"].(string)
			if account != "arondo@gmail.com" {
				t.Fatalf("expected account arondo@gmail.com, got %s", account)
			}
			plan, _ := payload.Quota["Plan"].(string)
			if plan != "Claude Pro account" {
				t.Fatalf("expected plan Claude Pro account, got %s", plan)
			}
		case <-time.After(35 * time.Second):
			t.Fatal("timed out waiting for claude quota.update")
		}
	})
}
