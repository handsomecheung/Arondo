package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestAutomationArguments(t *testing.T) {
	base := []string{"--server", "http://localhost", "--client-token", "secret", "--automation"}
	args, err := parseArgs(append(append([]string{}, base...), "--once", "--cache", "on", "message"), cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if !args.automation || !args.once || args.repoPath != "" || args.tempDir || args.noProject {
		t.Fatalf("unexpected automation arguments: %#v", args)
	}
	for _, conflict := range [][]string{{"--path", "/repo"}, {"--no-path"}, {"--temp-dir"}, {"--resume"}, {"--session-id", "s1"}} {
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

func TestDeprecatedTempDirWarningDoesNotPolluteJSON(t *testing.T) {
	t.Setenv("ARONDO_CONFIG_DIR", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/sessions":
			var payload map[string]any
			_ = json.NewDecoder(r.Body).Decode(&payload)
			if payload["tempDir"] != true || payload["automation"] != nil {
				t.Errorf("legacy payload changed: %#v", payload)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "legacy", "status": "done"})
		case "/api/sessions/legacy":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "legacy", "status": "done"})
		case "/api/messages":
			_, _ = io.WriteString(w, "[]")
		case "/api/sessions/legacy/log":
			_, _ = io.WriteString(w, `{"log":"result"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	stdout, err := os.CreateTemp(t.TempDir(), "stdout")
	if err != nil {
		t.Fatal(err)
	}
	defer stdout.Close()
	stderr, err := os.CreateTemp(t.TempDir(), "stderr")
	if err != nil {
		t.Fatal(err)
	}
	defer stderr.Close()
	previousOut, previousErr := os.Stdout, os.Stderr
	os.Stdout, os.Stderr = stdout, stderr
	t.Cleanup(func() { os.Stdout, os.Stderr = previousOut, previousErr })
	err = run([]string{"send", "--server", server.URL, "--client-token", "secret", "--temp-dir", "--output", "json", "--poll-interval", "0.01", "message"})
	os.Stdout, os.Stderr = previousOut, previousErr
	if err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(stdout.Name())
	warnings, _ := os.ReadFile(stderr.Name())
	if !json.Valid(out) || !strings.Contains(string(warnings), "--temp-dir is deprecated") {
		t.Fatalf("expected clean JSON and stderr warning, stdout=%s stderr=%s", out, warnings)
	}
}
