package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseArgsRunnerName(t *testing.T) {
	args, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--runner-name", "dev-runner", "Do work"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.runnerName != "dev-runner" || args.runnerID != "" {
		t.Fatalf("unexpected runner arguments: %#v", args)
	}

	_, err = parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--runner-id", "r1", "--runner-name", "dev-runner", "Do work"}, cliConfig{})
	if err == nil || err.Error() != "--runner-id cannot be used with --runner-name" {
		t.Fatalf("expected conflict error when both --runner-id and --runner-name are specified, got %v", err)
	}
}

func TestResolveRunnerIDByName(t *testing.T) {
	runnersResponse := []map[string]any{
		{"id": "runner-1", "name": "unique-runner", "hostname": "host-1", "connected": true},
		{"id": "runner-2", "name": "dup-runner", "hostname": "host-2", "connected": true},
		{"id": "runner-3", "name": "dup-runner", "hostname": "host-3", "connected": true},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/runners" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(runnersResponse)
	}))
	defer server.Close()

	c := &client{server: server.URL, token: "secret", http: server.Client()}

	gotID, err := resolveRunnerIDByName(c, "unique-runner")
	if err != nil {
		t.Fatalf("unexpected error resolving unique runner name: %v", err)
	}
	if gotID != "runner-1" {
		t.Fatalf("expected runner-1, got %q", gotID)
	}

	_, err = resolveRunnerIDByName(c, "dup-runner")
	if err == nil {
		t.Fatal("expected error for duplicate runner name")
	}
	if !strings.Contains(err.Error(), "use --runner-id instead of --runner-name") {
		t.Fatalf("expected hint to use --runner-id instead of --runner-name, got %v", err)
	}

	_, err = resolveRunnerIDByName(c, "missing-runner")
	if err == nil {
		t.Fatal("expected error for missing runner name")
	}
}

func TestRunSendWithRunnerName(t *testing.T) {
	var createdRunnerID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/runners":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"id": "runner-1", "name": "alpha", "hostname": "host-1", "connected": true},
				{"id": "runner-2", "name": "dup", "hostname": "host-2", "connected": true},
				{"id": "runner-3", "name": "dup", "hostname": "host-3", "connected": true},
			})
		case "/api/sessions":
			var payload map[string]any
			_ = json.NewDecoder(r.Body).Decode(&payload)
			createdRunnerID, _ = payload["runnerId"].(string)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":       "sess-1",
				"runnerId": createdRunnerID,
				"repoPath": payload["repoPath"],
				"status":   "done",
			})
		case "/api/sessions/sess-1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":     "sess-1",
				"status": "done",
			})
		case "/api/messages":
			_ = json.NewEncoder(w).Encode([]map[string]any{})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	err := run([]string{"send", "--server", server.URL, "--client-token", "secret", "--runner-name", "alpha", "--path", "/repo", "--poll-interval", "0.01", "Hello"})
	if err != nil {
		t.Fatalf("unexpected error running send with unique --runner-name: %v", err)
	}
	if createdRunnerID != "runner-1" {
		t.Fatalf("expected session created with runner-1, got %q", createdRunnerID)
	}

	err = run([]string{"send", "--server", server.URL, "--client-token", "secret", "--runner-name", "dup", "--path", "/repo", "Hello"})
	if err == nil {
		t.Fatal("expected error when multiple runners share the same name")
	}
	if !strings.Contains(err.Error(), "use --runner-id instead of --runner-name") {
		t.Fatalf("expected hint in error, got: %v", err)
	}
}

