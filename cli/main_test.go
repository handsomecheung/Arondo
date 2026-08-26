package main

import (
	"encoding/json"
	"errors"
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
	args, err := parseArgs([]string{"--server=https://arondo.example/", "--token", "secret", "--temp-dir", "--agent", "codex", "--confirmation", "auto", "--poll-interval=0.5", "--timeout", "12", "Do work"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || !args.tempDir || args.agentType != "codex" || args.confirmation != "auto" || args.pollInterval != 0.5 || args.timeout != 12 || args.prompt != "Do work" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsRejectsInvalidCombinations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--resume", "--temp-dir", "message"}, cliConfig{})
	if err == nil || err.Error() != "--resume cannot be used with --temp-dir" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsNonFiniteDurations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--timeout", "NaN", "message"}, cliConfig{})
	if err == nil || err.Error() != "--timeout must be a non-negative number" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsInvalidConfirmation(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--confirmation", "later", "message"}, cliConfig{})
	if err == nil || err.Error() != "--confirmation must be auto, draft, or force" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsDeprecatedForce(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--force", "message"}, cliConfig{})
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
	args, err := parseListAgentsArgs([]string{"--server=https://arondo.example/", "--token", "secret", "--runner-id", "runner-1"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || args.runnerID != "runner-1" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseListAgentsArgsRejectsMessage(t *testing.T) {
	_, err := parseListAgentsArgs([]string{"--server", "http://localhost", "--token", "secret", "message"}, cliConfig{})
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
	args, err := parseQuotaArgs([]string{"--server=https://arondo.example/", "--token", "secret"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseQuotaArgsRejectsUnexpectedArgument(t *testing.T) {
	_, err := parseQuotaArgs([]string{"--server", "http://localhost", "--token", "secret", "message"}, cliConfig{})
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
	if config.CLI.URL != "https://arondo.example" || config.CLI.Token != "token value" {
		t.Fatalf("unexpected config: %#v", config)
	}
}

func TestParseArgsUsesConfigAndArgumentsOverrideIt(t *testing.T) {
	t.Setenv("ARONDO_URL", "")
	t.Setenv("ARONDO_TOKEN", "")
	config := cliConfig{}
	config.CLI.URL = "https://configured.example"
	config.CLI.Token = "configured-token"

	args, err := parseArgs([]string{"--server", "https://argument.example", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://argument.example" || args.token != "configured-token" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsUsesEnvironmentVariablesAndArgumentsOverrideThem(t *testing.T) {
	t.Setenv("ARONDO_URL", "https://environment.example")
	t.Setenv("ARONDO_TOKEN", "environment-token")
	config := cliConfig{}
	config.CLI.URL = "https://configured.example"
	config.CLI.Token = "configured-token"

	args, err := parseArgs([]string{"--token", "argument-token", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://environment.example" || args.token != "argument-token" {
		t.Fatalf("unexpected arguments: %#v", args)
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
