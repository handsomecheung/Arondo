package main

import (
	"encoding/json"
	"math"
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
	assertAgyRemain(t, "GeminiWeeklyRemain", q.GeminiWeeklyRemain, 0.9786)
	assertAgyRemain(t, "GeminiHourRemain", q.GeminiHourRemain, 0.946)
	assertAgyRemain(t, "OtherWeeklyRemain", q.OtherWeeklyRemain, 0.959)
	assertAgyRemain(t, "OtherHourRemain", q.OtherHourRemain, 1)
	if q.GeminiWeeklyResetsAt == nil || q.GeminiHourResetsAt == nil || q.OtherWeeklyResetsAt == nil {
		t.Fatal("expected reset timestamps for non-full quotas")
	}
	if q.OtherHourResetsAt != nil {
		t.Fatal("available quota must not have a reset timestamp")
	}
}

func TestParseAgyQuotaLegacyUsageFormat(t *testing.T) {
	q := parseAgyQuota(`
GEMINI MODELS
  Weekly Limit Remaining
    78% remaining · Refreshes in 155h 15m
  Five Hour Limit Remaining
    Refreshes in 2h 15m
`)

	assertAgyRemain(t, "GeminiWeeklyRemain", q.GeminiWeeklyRemain, 0.78)
	assertAgyRemain(t, "GeminiHourRemain", q.GeminiHourRemain, 0)
	if q.GeminiWeeklyResetsAt == nil || q.GeminiHourResetsAt == nil {
		t.Fatal("expected reset timestamps for legacy quota format")
	}
}

func assertAgyRemain(t *testing.T, name string, got *float64, want float64) {
	t.Helper()
	if got == nil || math.Abs(*got-want) > 1e-9 {
		t.Fatalf("%s = %v, want %v", name, got, want)
	}
}

func TestParseCodexQuotaLatestStatusFormat(t *testing.T) {
	mockAuth := filepath.Join("..", "tests", "mocks", "tmux", "codex", "auth.json")
	t.Setenv("CODEX_AUTH_PATH", mockAuth)

	status, err := os.ReadFile(filepath.Join("..", "tests", "mocks", "tmux", "codex", "arondo-codex-status.txt"))
	if err != nil {
		t.Fatalf("failed to read Codex status fixture: %v", err)
	}

	content := strings.ReplaceAll(string(status), "__resets_5h__", "12:08 AM on 30 Sep")
	content = strings.ReplaceAll(content, "__resets_weekly__", "7:43 AM on 4 Oct")
	content = strings.ReplaceAll(content, "__resets_luna__", "11:22 PM on 6 Oct")

	q := parseCodexQuota(content)
	if q == nil {
		t.Fatal("parseCodexQuota returned nil")
	}
	if q.Account != "019f9883-1234-5678-9abc-def012345678" {
		t.Fatalf("Account = %q, want 019f9883-1234-5678-9abc-def012345678", q.Account)
	}
	if q.Plan != "Plus" {
		t.Fatalf("Plan = %q, want Plus", q.Plan)
	}
	if q.DefaultModel != "GPT-Reserve (reasoning medium, summaries auto)" {
		t.Fatalf("DefaultModel = %q, want 'GPT-Reserve (reasoning medium, summaries auto)'", q.DefaultModel)
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

func TestParseCodexQuotaLegacyStatusFormat(t *testing.T) {
	mockAuth := filepath.Join("..", "tests", "mocks", "tmux", "codex", "auth.json")
	t.Setenv("CODEX_AUTH_PATH", mockAuth)

	legacyStatus := `
╭──────────────────────────────────────────────────────────────────────────────────────╮
│  >_ OpenAI Codex (v0.153.1)                                                          │
│                                                                                      │
│  Model:                gpt-5.6-terra (reasoning medium, summaries auto)              │
│  Directory:            /data/arondo                                                  │
│  Account:              arondo@gmail.com (Plus)                                       │
│                                                                                      │
│  5h limit:             [████████████████████] 100% left (resets 12:48)               │
│  Weekly limit:         [████████████░░░░░░░░] 60% left (resets 11:28 on 7 Sep)       │
╰──────────────────────────────────────────────────────────────────────────────────────╯
`
	q := parseCodexQuota(legacyStatus)
	if q == nil {
		t.Fatal("parseCodexQuota returned nil for legacy status")
	}
	if q.Account != "019f9883-1234-5678-9abc-def012345678" {
		t.Fatalf("Account = %q, want 019f9883-1234-5678-9abc-def012345678", q.Account)
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

func TestParseCodexQuotaRealStatusOutput(t *testing.T) {
	mockAuth := filepath.Join("..", "tests", "mocks", "tmux", "codex", "auth.json")
	t.Setenv("CODEX_AUTH_PATH", mockAuth)

	status := `/status

╭───────────────────────────────────────────────────────────────────────────────────────────╮
│  >_ OpenAI Codex (v0.158.0)                                                               │
│                                                                                           │
│ Visit https://chatgpt.com/codex/settings/usage for up-to-date                             │
│ information on rate limits and credits                                                    │
│                                                                                           │
│  Server:                      Local background server                                     │
│                                                                                           │
│  Model:                       GPT-Reserve (reasoning medium, summaries auto)              │
│  Model provider:              openai                                                      │
│  Directory:                   /mnt/coder-workspaces/private-workspace/repos/github/Arondo │
│  Permissions:                 Full Access                                                 │
│  Agents.md:                   ~/.codex/AGENTS.md, AGENTS.md                               │
│  Account:                     Plus                                                        │
│  Collaboration mode:          Default                                                     │
│  Session:                     01a0ed8b-f070-7c12-8ac9-036bf01fc427                        │
│                                                                                           │
│  5h limit:                    [░░░░░░░░░░░░░░░░░░░░] 0% left (resets 12:08 AM on 30 Sep)  │
│  Weekly limit:                [███░░░░░░░░░░░░░░░░░] 16% left (resets 7:43 AM on 4 Oct)   │
│  Luna Reserve Weekly limit:   [████████████████████] 100% left (resets 11:22 PM on 6 Oct) │
╰───────────────────────────────────────────────────────────────────────────────────────────╯`

	q := parseCodexQuota(status)
	if q == nil {
		t.Fatal("parseCodexQuota returned nil for real status output")
	}
	if q.Account != "019f9883-1234-5678-9abc-def012345678" {
		t.Fatalf("Account = %q, want 019f9883-1234-5678-9abc-def012345678", q.Account)
	}
	if q.Plan != "Plus" {
		t.Fatalf("Plan = %q, want Plus", q.Plan)
	}
	if q.DefaultModel != "GPT-Reserve (reasoning medium, summaries auto)" {
		t.Fatalf("DefaultModel = %q, want 'GPT-Reserve (reasoning medium, summaries auto)'", q.DefaultModel)
	}
	if q.FiveHourRemain == nil || *q.FiveHourRemain != 0.0 {
		t.Fatalf("FiveHourRemain = %v, want 0.0", q.FiveHourRemain)
	}
	if q.FiveHourResetAt == nil {
		t.Fatal("expected FiveHourResetAt to be set")
	}
	if q.WeeklyRemain == nil || *q.WeeklyRemain != 0.16 {
		t.Fatalf("WeeklyRemain = %v, want 0.16", q.WeeklyRemain)
	}
	if q.WeeklyResetAt == nil {
		t.Fatal("expected WeeklyResetAt to be set")
	}
}

func TestParseCodexQuotaFallbackUnknownWhenNoAuth(t *testing.T) {
	t.Setenv("CODEX_AUTH_PATH", filepath.Join(t.TempDir(), "nonexistent_auth.json"))

	status := `
╭───────────────────────────────────────────────────────────────────────────────────────────╮
│  Account:                     Plus                                                        │
│  Model:                       GPT-Reserve (reasoning medium, summaries auto)              │
│  Weekly limit:                [████████████░░░░░░░░] 60% left (resets 7:43 AM on 4 Oct)   │
╰───────────────────────────────────────────────────────────────────────────────────────────╯`

	q := parseCodexQuota(status)
	if q == nil {
		t.Fatal("parseCodexQuota returned nil")
	}
	if q.Account != "unknown" {
		t.Fatalf("Account = %q, want unknown", q.Account)
	}
	if q.Plan != "Plus" {
		t.Fatalf("Plan = %q, want Plus", q.Plan)
	}
}

func TestReadCodexAccountID(t *testing.T) {
	dir := t.TempDir()

	// 1. Valid auth.json with account_id
	validAuthPath := filepath.Join(dir, "valid_auth.json")
	if err := os.WriteFile(validAuthPath, []byte(`{"tokens":{"account_id":"acc-12345"}}`), 0644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_AUTH_PATH", validAuthPath)
	if got := readCodexAccountID(); got != "acc-12345" {
		t.Fatalf("readCodexAccountID() = %q, want acc-12345", got)
	}

	// 2. Auth.json missing account_id
	emptyAuthPath := filepath.Join(dir, "empty_auth.json")
	if err := os.WriteFile(emptyAuthPath, []byte(`{"tokens":{"account_id":""}}`), 0644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_AUTH_PATH", emptyAuthPath)
	if got := readCodexAccountID(); got != "unknown" {
		t.Fatalf("readCodexAccountID() = %q, want unknown", got)
	}

	// 3. Invalid JSON
	invalidAuthPath := filepath.Join(dir, "invalid.json")
	if err := os.WriteFile(invalidAuthPath, []byte(`not json`), 0644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_AUTH_PATH", invalidAuthPath)
	if got := readCodexAccountID(); got != "unknown" {
		t.Fatalf("readCodexAccountID() = %q, want unknown", got)
	}

	// 4. Nonexistent file
	t.Setenv("CODEX_AUTH_PATH", filepath.Join(dir, "nonexistent.json"))
	if got := readCodexAccountID(); got != "unknown" {
		t.Fatalf("readCodexAccountID() = %q, want unknown", got)
	}
}

func TestParseCodexResetsTimestamp(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{"24h time only", "12:48"},
		{"24h date and time", "11:28 on 7 Sep"},
		{"24h single digit hour and day", "3:08 on 2 Mar"},
		{"12h AM with date", "12:08 AM on 30 Sep"},
		{"12h AM single digit hour with date", "7:43 AM on 4 Oct"},
		{"12h PM with date", "11:22 PM on 6 Oct"},
		{"12h time only AM", "12:08 AM"},
		{"12h time only PM", "7:43 PM"},
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
	mockCodexAuthPath := filepath.Clean(filepath.Join(wd, "../tests/mocks/tmux/codex/auth.json"))
	t.Setenv("CODEX_AUTH_PATH", mockCodexAuthPath)
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
			if account != "019f9883-1234-5678-9abc-def012345678" {
				t.Fatalf("expected account 019f9883-1234-5678-9abc-def012345678, got %s", account)
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
