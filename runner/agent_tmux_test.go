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

func TestParseResetsTimestamp(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{"same-day time", "1:09pm (Asia/Tokyo)"},
		{"same-day time no minutes", "3am (Asia/Tokyo)"},
		{"comma date", "Jul 1, 5am (Asia/Tokyo)"},
		{"comma date with minutes", "Jul 1, 4:59am (Europe/London)"},
		{"at date", "Jul 15 at 4:59am (Asia/Tokyo)"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := parseResetsTimestamp(c.input)
			if ts == nil {
				t.Fatalf("parseResetsTimestamp(%q) = nil, want a valid timestamp", c.input)
			}
		})
	}

	if ts := parseResetsTimestamp(""); ts != nil {
		t.Fatalf("parseResetsTimestamp(\"\") = %v, want nil", *ts)
	}
	if ts := parseResetsTimestamp("not a valid reset string"); ts != nil {
		t.Fatalf("parseResetsTimestamp(%q) = %v, want nil", "not a valid reset string", *ts)
	}
}

func TestParseClaudeAPIKeyStatus(t *testing.T) {
	status, err := os.ReadFile(filepath.Join("..", "tests", "mocks", "tmux", "claude", "arondo-claude-status.key.txt"))
	if err != nil {
		t.Fatalf("failed to read Claude API Key status fixture: %v", err)
	}

	q := parseClaudeStatus(string(status))
	if q.Plan != "API Usage Billing" {
		t.Fatalf("Plan = %q, want API Usage Billing", q.Plan)
	}
	if q.Account != "arondo@gmail.com" {
		t.Fatalf("Account = %q, want arondo@gmail.com", q.Account)
	}
	if !q.IsAPIKey {
		t.Fatal("IsAPIKey = false, want true")
	}
}

func TestParseAgyQuotaLatestUsageFormat(t *testing.T) {
	usage, err := os.ReadFile(filepath.Join("..", "tests", "mocks", "tmux", "agy", "arondo-agy-usage.txt"))
	if err != nil {
		t.Fatalf("failed to read agy usage fixture: %v", err)
	}

	q := parseAgyQuota(string(usage))
	if q.Account != "arondo@gmail.com" {
		t.Fatalf("Account = %q, want arondo@gmail.com", q.Account)
	}
	assertAgyRemain(t, "GeminiWeeklyRemain", q.GeminiWeeklyRemain, 0.78)
	assertAgyRemain(t, "GeminiHourRemain", q.GeminiHourRemain, 0)
	assertAgyRemain(t, "OtherWeeklyRemain", q.OtherWeeklyRemain, 1)
	assertAgyRemain(t, "OtherHourRemain", q.OtherHourRemain, 1)
	if q.GeminiWeeklyResetsAt == nil || q.GeminiHourResetsAt == nil {
		t.Fatal("expected Gemini reset timestamps")
	}
	if q.OtherWeeklyResetsAt != nil || q.OtherHourResetsAt != nil {
		t.Fatal("available quotas must not have reset timestamps")
	}
}

func assertAgyRemain(t *testing.T, name string, got *float64, want float64) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("%s = %v, want %v", name, got, want)
	}
}

func TestParseCodexQuotaLatestStatusFormat(t *testing.T) {
	status, err := os.ReadFile(filepath.Join("..", "tests", "mocks", "tmux", "codex", "arondo-codex-status.txt"))
	if err != nil {
		t.Fatalf("failed to read Codex status fixture: %v", err)
	}

	content := strings.ReplaceAll(string(status), "__resets_5h__", "12:48")
	content = strings.ReplaceAll(content, "__resets_weekly__", "11:28 on 7 Sep")

	q := parseCodexQuota(content)
	if q == nil {
		t.Fatal("parseCodexQuota returned nil")
	}
	if q.Account != "arondo@gmail.com" {
		t.Fatalf("Account = %q, want arondo@gmail.com", q.Account)
	}
	if q.Plan != "Plus" {
		t.Fatalf("Plan = %q, want Plus", q.Plan)
	}
	if q.DefaultModel != "gpt-5.6-terra (reasoning medium, summaries auto)" {
		t.Fatalf("DefaultModel = %q, want 'gpt-5.6-terra (reasoning medium, summaries auto)'", q.DefaultModel)
	}
	if q.FiveHourRemain == nil || *q.FiveHourRemain != 1.0 {
		t.Fatalf("FiveHourRemain = %v, want 1.0", q.FiveHourRemain)
	}
	if q.FiveHourResetAt == nil {
		t.Fatal("expected FiveHourResetAt to be set")
	}
	if q.WeeklyRemain == nil || *q.WeeklyRemain != 0.60 {
		t.Fatalf("WeeklyRemain = %v, want 0.60", q.WeeklyRemain)
	}
	if q.WeeklyResetAt == nil {
		t.Fatal("expected WeeklyResetAt to be set")
	}
}

func TestParseCodexResetsTimestamp(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{"time only", "12:48"},
		{"date and time", "11:28 on 7 Sep"},
		{"single digit hour and day", "3:08 on 2 Mar"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := parseCodexResetsTimestamp(c.input)
			if ts == nil {
				t.Fatalf("parseCodexResetsTimestamp(%q) = nil, want a valid timestamp", c.input)
			}
		})
	}

	if ts := parseCodexResetsTimestamp(""); ts != nil {
		t.Fatalf("parseCodexResetsTimestamp(\"\") = %v, want nil", *ts)
	}
	if ts := parseCodexResetsTimestamp("invalid timestamp"); ts != nil {
		t.Fatalf("parseCodexResetsTimestamp(%q) = %v, want nil", "invalid timestamp", *ts)
	}
}

func TestAgentQuotas(t *testing.T) {
	// Set up mock bin directory in PATH
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}
	// The path to mock bin directories
	mockAgyBinDir := filepath.Clean(filepath.Join(wd, "../tests/mocks/bin/agy"))
	mockClaudeBinDir := filepath.Clean(filepath.Join(wd, "../tests/mocks/bin/claude"))
	mockCodexBinDir := filepath.Clean(filepath.Join(wd, "../tests/mocks/bin/codex"))
	originalPath := os.Getenv("PATH")
	err = os.Setenv("PATH", mockAgyBinDir+":"+mockClaudeBinDir+":"+mockCodexBinDir+":"+originalPath)
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
			if plan != "" {
				t.Fatalf("expected no plan in latest usage output, got %s", plan)
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

	// 3. Fetch Codex Quota
	t.Run("CodexQuota", func(t *testing.T) {
		go fetchCodexQuota(client)

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
			if payload.Agent != "codex" {
				t.Fatalf("expected agent codex, got %s", payload.Agent)
			}
			account, _ := payload.Quota["Account"].(string)
			if account != "arondo@gmail.com" {
				t.Fatalf("expected account arondo@gmail.com, got %s", account)
			}
			plan, _ := payload.Quota["Plan"].(string)
			if plan != "Plus" {
				t.Fatalf("expected plan Plus, got %s", plan)
			}
			weeklyRemain, _ := payload.Quota["WeeklyRemain"].(float64)
			if weeklyRemain < 0.59 || weeklyRemain > 0.61 {
				t.Fatalf("expected WeeklyRemain ~0.60, got %v", weeklyRemain)
			}
			fiveHourRemain, _ := payload.Quota["FiveHourRemain"].(float64)
			if fiveHourRemain < 0.99 || fiveHourRemain > 1.01 {
				t.Fatalf("expected FiveHourRemain ~1.0, got %v", fiveHourRemain)
			}
		case <-time.After(35 * time.Second):
			t.Fatal("timed out waiting for codex quota.update")
		}
	})
}
