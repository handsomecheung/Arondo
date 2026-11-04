package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAutomationArguments(t *testing.T) {
	base := []string{"--server", "http://localhost", "--client-token", "secret", "--automation"}
	args, err := parseArgs(append(append([]string{}, base...), "--once", "--cache", "on", "message"), cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if !args.automation || !args.once || args.repoPath != "" || args.noProject {
		t.Fatalf("unexpected automation arguments: %#v", args)
	}
	for _, conflict := range [][]string{{"--path", "/repo"}, {"--no-path"}, {"--resume"}, {"--session-id", "s1"}} {
		t.Run(strings.Join(conflict, " "), func(t *testing.T) {
			argv := append(append([]string{}, base...), conflict...)
			if _, err := parseArgs(append(argv, "message"), cliConfig{}); err == nil {
				t.Fatal("expected conflicting automation options to fail")
			}
		})
	}
}

func TestAutomationCreationPayloads(t *testing.T) {
	for _, queued := range []bool{false, true} {
		t.Run(map[bool]string{false: "immediate", true: "queued"}[queued], func(t *testing.T) {
			var payload map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Error(err)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"id": "automation-session"})
			}))
			defer server.Close()
			c := &client{server: server.URL, token: "secret", http: server.Client()}
			args := arguments{automation: true, once: true, cache: "on", prompt: "message", agentType: "auto"}
			var err error
			if queued {
				_, err = c.createQueuedSession(args, "manual")
			} else {
				_, err = c.createSession(args, false)
			}
			if err != nil {
				t.Fatal(err)
			}
			if payload["automation"] != true || payload["once"] != true || payload["cache"] != "on" {
				t.Fatalf("unexpected payload: %#v", payload)
			}
			for _, key := range []string{"repoPath", "tempDir", "noProject"} {
				if _, found := payload[key]; found {
					t.Fatalf("automation payload must omit %s", key)
				}
			}
		})
	}
}

func TestRemovedTempDirFlagIsRejected(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--temp-dir", "message"}, cliConfig{})
	if err == nil || err.Error() != "unknown option: --temp-dir" {
		t.Fatalf("expected --temp-dir to be rejected as unknown option, got %v", err)
	}
}
