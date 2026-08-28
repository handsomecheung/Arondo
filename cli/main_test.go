package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPollDetachedAgentUntilDoneReturnsDetachedRunAndResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/messages" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("sessionId") != "session-1" {
			t.Fatalf("unexpected session ID: %s", r.URL.Query().Get("sessionId"))
		}
		_ = json.NewEncoder(w).Encode([]message{
			{ID: "run-1", Type: "detached-agent-run"},
			{ID: "return-1", Type: "detached-agent-return", ParentID: "run-1", Role: "agent"},
		})
	}))
	defer server.Close()

	run, returned, err := pollDetachedAgentUntilDone(&client{server: server.URL, http: server.Client()}, "session-1", "run-1", time.Millisecond, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if run.ID != "run-1" || returned.ID != "return-1" {
		t.Fatalf("unexpected result: run=%#v returned=%#v", run, returned)
	}
}

func TestConversationMessagesExcludesDetachedAgentMessages(t *testing.T) {
	messages, err := (&client{}).conversationMessages("session-1", []message{
		{ID: "user-1", Type: "chat-user", Role: "user"},
		{ID: "run-1", Type: "detached-agent-run", Role: "system"},
		{ID: "return-1", Type: "detached-agent-return", Role: "agent"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].ID != "user-1" {
		t.Fatalf("unexpected conversation messages: %#v", messages)
	}
}

func TestParseArgs(t *testing.T) {
	args, err := parseArgs([]string{"--server=https://arondo.example/", "--client-token", "secret", "--temp-dir", "--agent", "codex", "--confirmation", "auto", "--poll-interval=0.5", "--timeout", "12", "Do work"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || !args.tempDir || args.agentType != "codex" || args.confirmation != "auto" || args.pollInterval != 0.5 || args.timeout != 12 || args.prompt != "Do work" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsRejectsInvalidCombinations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--resume", "--temp-dir", "message"}, cliConfig{})
	if err == nil || err.Error() != "--resume cannot be used with --temp-dir" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsNonFiniteDurations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--timeout", "NaN", "message"}, cliConfig{})
	if err == nil || err.Error() != "--timeout must be a non-negative number" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsInvalidConfirmation(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--confirmation", "later", "message"}, cliConfig{})
	if err == nil || err.Error() != "--confirmation must be auto, draft, or force" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsDeprecatedForce(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--client-token", "secret", "--force", "message"}, cliConfig{})
	if err == nil || err.Error() != "--force has been replaced by --confirmation force" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsReturnsHelp(t *testing.T) {
	_, err := parseArgs([]string{"--help"}, cliConfig{})
	if !errors.Is(err, errHelp) {
		t.Fatalf("expected help error, got %v", err)
	}
}

func TestParseListAgentsArgs(t *testing.T) {
	args, err := parseListAgentsArgs([]string{"--server=https://arondo.example/", "--client-token", "secret", "--runner-id", "runner-1"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || args.runnerID != "runner-1" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseListAgentsArgsRejectsMessage(t *testing.T) {
	_, err := parseListAgentsArgs([]string{"--server", "http://localhost", "--client-token", "secret", "message"}, cliConfig{})
	if err == nil || err.Error() != "unexpected argument: message" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseListAgentsArgsReturnsHelp(t *testing.T) {
	_, err := parseListAgentsArgs([]string{"--help"}, cliConfig{})
	if !errors.Is(err, errHelp) {
		t.Fatalf("expected help error, got %v", err)
	}
}

func TestParseQuotaArgs(t *testing.T) {
	args, err := parseQuotaArgs([]string{"--server=https://arondo.example/", "--client-token", "secret"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseQuotaArgsRejectsUnexpectedArgument(t *testing.T) {
	_, err := parseQuotaArgs([]string{"--server", "http://localhost", "--client-token", "secret", "message"}, cliConfig{})
	if err == nil || err.Error() != "unexpected argument: message" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseQuotaArgsReturnsHelp(t *testing.T) {
	_, err := parseQuotaArgs([]string{"--help"}, cliConfig{})
	if !errors.Is(err, errHelp) {
		t.Fatalf("expected help error, got %v", err)
	}
}

func TestHumanReadableQuotaTimesFormatsAtFields(t *testing.T) {
	quota := map[string]any{
		"HourResetAt":    float64(1782923340),
		"WeeklyResetAt":  int64(1787806200000),
		"updatedAt":      "2026-06-30T12:30:00Z",
		"HourRemain":     float64(0.5),
		"notParseableAt": "unknown",
		"nested":         map[string]any{"OtherHourResetsAt": 1787221330},
	}

	got := humanReadableQuotaTimes(quota)

	assertQuotaTime(t, got["HourResetAt"], time.Unix(1782923340, 0))
	assertQuotaTime(t, got["WeeklyResetAt"], time.UnixMilli(1787806200000))
	assertQuotaTime(t, got["updatedAt"], time.Date(2026, 6, 30, 12, 30, 0, 0, time.UTC))
	if got["HourRemain"] != float64(0.5) {
		t.Fatalf("HourRemain changed: %#v", got["HourRemain"])
	}
	if got["notParseableAt"] != "unknown" {
		t.Fatalf("notParseableAt changed: %#v", got["notParseableAt"])
	}
	nested, ok := got["nested"].(map[string]any)
	if !ok {
		t.Fatalf("nested quota was not preserved: %#v", got["nested"])
	}
	assertQuotaTime(t, nested["OtherHourResetsAt"], time.Unix(1787221330, 0))
}

func assertQuotaTime(t *testing.T, got any, want time.Time) {
	t.Helper()
	expected := want.Local().Format("2006-01-02 15:04:05 MST")
	if got != expected {
		t.Fatalf("formatted time = %#v, want %q", got, expected)
	}
}

func TestAnalyzeAgentStatusReasons(t *testing.T) {
	disconnected := analyzeAgentStatus(runner{Connected: false, Agents: []string{"codex"}}, "codex", "codex", nil)
	if disconnected.Available || disconnected.Reason != "runner disconnected" {
		t.Fatalf("unexpected disconnected status: %#v", disconnected)
	}

	missing := analyzeAgentStatus(runner{Connected: true}, "codex", "codex", nil)
	if missing.Available || missing.Reason != `binary "codex" not found on runner PATH` {
		t.Fatalf("unexpected missing binary status: %#v", missing)
	}

	quotaLow := analyzeAgentStatus(runner{Connected: true, Agents: []string{"claude"}}, "claude", "claude", map[string]any{"HourRemain": 0.1})
	if quotaLow.Available || quotaLow.Reason != "hourly quota below 15%" {
		t.Fatalf("unexpected quota status: %#v", quotaLow)
	}

	available := analyzeAgentStatus(runner{Connected: true, Agents: []string{"opencode"}}, "opencode", "opencode", nil)
	if !available.Available || available.Reason != "" {
		t.Fatalf("unexpected available status: %#v", available)
	}
}

func TestLoadConfig(t *testing.T) {
	config, err := loadConfig("testdata/arondo.json")
	if err != nil {
		t.Fatal(err)
	}
	if config.CLI.Server != "https://arondo.example" || config.CLI.ClientToken != "token value" {
		t.Fatalf("unexpected config: %#v", config)
	}
}

func TestParseArgsUsesConfigAndArgumentsOverrideIt(t *testing.T) {
	t.Setenv("ARONDO_SERVER", "")
	t.Setenv("ARONDO_CLIENT_TOKEN", "")
	config := cliConfig{}
	config.CLI.Server = "https://configured.example"
	config.CLI.ClientToken = "configured-token"

	args, err := parseArgs([]string{"--server", "https://argument.example", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://argument.example" || args.token != "configured-token" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsUsesEnvironmentVariablesAndArgumentsOverrideThem(t *testing.T) {
	t.Setenv("ARONDO_SERVER", "https://environment.example")
	t.Setenv("ARONDO_CLIENT_TOKEN", "environment-token")
	config := cliConfig{}
	config.CLI.Server = "https://configured.example"
	config.CLI.ClientToken = "configured-token"

	args, err := parseArgs([]string{"--client-token", "argument-token", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://environment.example" || args.token != "argument-token" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsRejectsLegacyTokenFlag(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "message"}, cliConfig{})
	if err == nil || err.Error() != "unknown option: --token" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestConfigDirUsesEnvironmentOverride(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("ARONDO_CONFIG_DIR", directory)

	got, err := configDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != directory {
		t.Fatalf("configDir() = %q, want %q", got, directory)
	}
}

func TestLoadConfigRejectsInvalidJSON(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "arondo.json")
	if err := os.WriteFile(filePath, []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig(filePath); err == nil {
		t.Fatal("expected invalid JSON error")
	}
}

func TestWebsocketURL(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"http://localhost:3251", "ws://localhost:3251/ws"},
		{"https://arondo.example.com", "wss://arondo.example.com/ws"},
		{"http://localhost:3251/", "ws://localhost:3251/ws"},
		{"http://localhost:3251/ws", "ws://localhost:3251/ws"},
		{"https://arondo.example.com/subpath", "wss://arondo.example.com/subpath/ws"},
		{"ws://localhost:3251", "ws://localhost:3251/ws"},
		{"wss://localhost:3251", "wss://localhost:3251/ws"},
	}
	for _, tt := range tests {
		got, err := websocketURL(tt.input)
		if err != nil {
			t.Fatalf("websocketURL(%q) error: %v", tt.input, err)
		}
		if got != tt.want {
			t.Errorf("websocketURL(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func writeServerWSFrame(w io.Writer, opcode byte, payload []byte) error {
	var header []byte
	length := len(payload)
	header = append(header, 0x80|opcode)
	if length <= 125 {
		header = append(header, byte(length))
	} else if length <= 65535 {
		header = append(header, 126, byte(length>>8), byte(length&0xFF))
	} else {
		header = append(header, 127, 0, 0, 0, 0, byte(length>>24), byte(length>>16), byte(length>>8), byte(length&0xFF))
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func TestStreamSessionUntilDoneWS(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			hj, ok := w.(http.Hijacker)
			if !ok {
				http.Error(w, "hijack not supported", http.StatusInternalServerError)
				return
			}
			conn, bufrw, err := hj.Hijack()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer conn.Close()

			bufrw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
			bufrw.WriteString("Upgrade: websocket\r\n")
			bufrw.WriteString("Connection: Upgrade\r\n")
			bufrw.WriteString("Sec-WebSocket-Protocol: arondo-token\r\n\r\n")
			bufrw.Flush()

			// Send chunk 1
			c1, _ := json.Marshal(map[string]any{
				"type":      "terminal:output",
				"sessionId": "sess-ws-1",
				"data":      "Hello ",
			})
			_ = writeServerWSFrame(bufrw, 0x1, c1)
			bufrw.Flush()

			// Send chunk 2
			c2, _ := json.Marshal(map[string]any{
				"type":      "terminal:output",
				"sessionId": "sess-ws-1",
				"data":      "Streamed World!\n",
			})
			_ = writeServerWSFrame(bufrw, 0x1, c2)
			bufrw.Flush()

			// Send session:updated done
			doneMsg, _ := json.Marshal(map[string]any{
				"type": "session:updated",
				"payload": map[string]any{
					"id":     "sess-ws-1",
					"status": "done",
				},
			})
			_ = writeServerWSFrame(bufrw, 0x1, doneMsg)
			bufrw.Flush()
			return
		}
		if r.URL.Path == "/api/sessions/sess-ws-1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":     "sess-ws-1",
				"status": "done",
			})
			return
		}
	}))
	defer server.Close()

	ws, err := dialWebSocket(server.URL, "token123", time.Second)
	if err != nil {
		t.Fatalf("dialWebSocket error: %v", err)
	}

	c := &client{server: server.URL, token: "token123", http: server.Client()}
	args := arguments{output: "plain"}
	sess, output, failed, err := streamSessionUntilDone(c, args, "sess-ws-1", "", ws, 100*time.Millisecond, 2*time.Second)
	if err != nil {
		t.Fatalf("streamSessionUntilDone error: %v", err)
	}
	if sess.Status != "done" {
		t.Errorf("unexpected status: %s", sess.Status)
	}
	if output != "Hello Streamed World!\n" {
		t.Errorf("unexpected output: %q", output)
	}
	if failed {
		t.Errorf("expected failed == false")
	}
}

func TestStreamSessionUntilDoneFallbackPolling(t *testing.T) {
	pollCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/sessions/sess-poll-1" {
			pollCount++
			status := "running"
			if pollCount >= 2 {
				status = "done"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":     "sess-poll-1",
				"status": status,
			})
			return
		}
		if r.URL.Path == "/api/messages" {
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"id": "msg-1", "type": "agent-run"},
			})
			return
		}
		if r.URL.Path == "/api/sessions/sess-poll-1/log" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"log": "Polled output result\n",
			})
			return
		}
	}))
	defer server.Close()

	c := &client{server: server.URL, token: "token123", http: server.Client()}
	args := arguments{output: "plain"}
	sess, output, failed, err := streamSessionUntilDone(c, args, "sess-poll-1", "", nil, 10*time.Millisecond, 2*time.Second)
	if err != nil {
		t.Fatalf("streamSessionUntilDone error: %v", err)
	}
	if sess.Status != "done" {
		t.Errorf("unexpected status: %s", sess.Status)
	}
	if output != "Polled output result\n" {
		t.Errorf("unexpected output: %q", output)
	}
	if failed {
		t.Errorf("expected failed == false")
	}
}
