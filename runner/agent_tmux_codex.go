package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func fetchCodexQuota(client *Client) {
	session := tmuxSessionName("codex")
	run("tmux", "kill-session", "-t", session) //nolint

	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("[quota/codex] failed to get cwd: %v", err)
		return
	}
	if err := run("tmux", "new-session", "-d", "-s", session, "-c", cwd, "-x", "220", "-y", "50", "codex"); err != nil {
		log.Printf("[quota/codex] failed to start tmux session: %v", err)
		return
	}
	defer run("tmux", "kill-session", "-t", session) //nolint

	time.Sleep(10 * time.Second)

	confirmCodexPrompts(session)

	// Typing "/status" opens a slash-command autocomplete popup (it also
	// matches "/statusline"); sending Enter in the same send-keys call arrives
	// before the popup settles and gets swallowed instead of submitting. A
	// short pause between typing and Enter is required — verified interactively.
	if err := run("tmux", "send-keys", "-t", session, "/status"); err != nil {
		log.Printf("[quota/codex] failed to send /status: %v", err)
		return
	}
	time.Sleep(1 * time.Second)
	if err := run("tmux", "send-keys", "-t", session, "Enter"); err != nil {
		log.Printf("[quota/codex] failed to submit /status: %v", err)
		return
	}

	output, err := pollTmuxPane(session, 30*time.Second, func(text string) bool {
		return strings.Contains(text, "Account:") && (strings.Contains(text, "Weekly limit") || strings.Contains(text, "5h limit") || strings.Contains(text, "limit:"))
	})
	if err != nil {
		log.Printf("[quota/codex] timed out waiting for status output: %v", err)
	}

	if path, werr := writeTmp("codex-status", output); werr != nil {
		log.Printf("[quota/codex] failed to write status output: %v", werr)
	} else {
		log.Printf("[quota/codex] status output saved to: %s", path)
	}

	q := parseCodexQuota(output)
	if q == nil {
		log.Printf("[quota/codex] failed to parse status output")
		return
	}
	sendQuotaUpdate(client, "codex", q)
	log.Printf("[quota/codex] account       : %s", q.Account)
	log.Printf("[quota/codex] plan          : %s", q.Plan)
	log.Printf("[quota/codex] default model : %s", q.DefaultModel)
	log.Printf("[quota/codex] 5h remain     : %s", fmtF(q.FiveHourRemain))
	log.Printf("[quota/codex] 5h resets     : %s", fmtI(q.FiveHourResetAt))
	log.Printf("[quota/codex] week remain   : %s", fmtF(q.WeeklyRemain))
	log.Printf("[quota/codex] week resets   : %s", fmtI(q.WeeklyResetAt))
}

// CodexQuota holds parsed account and quota data from /status.
type CodexQuota struct {
	Account         string
	Plan            string
	DefaultModel    string
	FiveHourRemain  *float64 // 0-1, null if unavailable
	FiveHourResetAt *int64   // Unix timestamp, null if unavailable
	WeeklyRemain    *float64 // 0-1, null if unavailable
	WeeklyResetAt   *int64   // Unix timestamp, null if unavailable
}

var (
	codexAccountRe     = regexp.MustCompile(`Account:\s+([^\n\r│]+)`)
	codexEmailPlanRe   = regexp.MustCompile(`^(\S+@\S+)\s+\(([^)]+)\)$`)
	codexModelRe       = regexp.MustCompile(`Model:\s+(.+)`)
	// e.g. "5h limit:             [████████████████████] 100% left (resets 12:48)" or "resets 12:08 AM on 30 Sep"
	codex5hLimitRe = regexp.MustCompile(`(?m)(?:^|[│\r\n])\s*5h limit:.*?(\d+)%\s+left(?:\s+\(resets\s+([^)]+)\))?`)
	// e.g. "Weekly limit:         [████████████░░░░░░░░] 60% left (resets 11:28 on 7 Sep)" or "resets 7:43 AM on 4 Oct"
	codexWeeklyLimitRe = regexp.MustCompile(`(?m)(?:^|[│\r\n])\s*Weekly limit:.*?(\d+)%\s+left(?:\s+\(resets\s+([^)]+)\))?`)
	// "11:28 on 7 Sep", "12:48", "12:08 AM on 30 Sep", "7:43 AM on 4 Oct", "11:22 PM on 6 Oct", etc.
	codexResetsDateTimeRe = regexp.MustCompile(`^(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?(?:\s+on\s+(\d{1,2})\s+(\w{3}))?$`)
)

func parseCodexQuota(rawText string) *CodexQuota {
	text := stripAnsi(rawText)
	q := &CodexQuota{}

	hasAccountLine := false
	if m := codexAccountRe.FindStringSubmatch(text); m != nil {
		hasAccountLine = true
		raw := strings.TrimSpace(m[1])
		if planMatch := codexEmailPlanRe.FindStringSubmatch(raw); planMatch != nil {
			q.Plan = planMatch[2]
		} else if !strings.Contains(raw, "@") {
			q.Plan = raw
		}
	}
	if m := codexModelRe.FindStringSubmatch(text); m != nil {
		model := strings.TrimSpace(m[1])
		model = strings.TrimRight(model, " ││\t\r\n")
		q.DefaultModel = strings.TrimSpace(model)
	}
	if !hasAccountLine {
		// /status never rendered (e.g. login/trust prompt blocked it) — nothing usable.
		return nil
	}

	q.Account = readCodexAccountID()
	if q.Account == "" {
		q.Account = "unknown"
	}

	if m := codex5hLimitRe.FindStringSubmatch(text); m != nil {
		q.FiveHourRemain = pctToFloat(m[1])
		if len(m) > 2 && m[2] != "" {
			q.FiveHourResetAt = parseCodexResetsTimestamp(m[2])
		}
	}

	if m := codexWeeklyLimitRe.FindStringSubmatch(text); m != nil {
		q.WeeklyRemain = pctToFloat(m[1])
		if len(m) > 2 && m[2] != "" {
			q.WeeklyResetAt = parseCodexResetsTimestamp(m[2])
		}
	}

	return q
}

// readCodexAccountID attempts to read tokens.account_id from ~/.codex/auth.json.
// If reading or parsing fails, or if account_id is empty, it returns "unknown".
func readCodexAccountID() string {
	var authPath string
	if custom := os.Getenv("CODEX_AUTH_PATH"); custom != "" {
		authPath = custom
	} else if codexHome := os.Getenv("CODEX_HOME"); codexHome != "" {
		authPath = filepath.Join(codexHome, "auth.json")
	} else if home, err := os.UserHomeDir(); err == nil {
		authPath = filepath.Join(home, ".codex", "auth.json")
	}
	if authPath == "" {
		return "unknown"
	}
	data, err := os.ReadFile(authPath)
	if err != nil {
		return "unknown"
	}
	var auth struct {
		Tokens struct {
			AccountID string `json:"account_id"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(data, &auth); err != nil || strings.TrimSpace(auth.Tokens.AccountID) == "" {
		return "unknown"
	}
	return strings.TrimSpace(auth.Tokens.AccountID)
}

// parseCodexResetsTimestamp converts a string like "12:48", "11:28 on 7 Sep",
// "12:08 AM on 30 Sep", or "7:43 AM on 4 Oct" to a Unix timestamp of the next occurrence.
func parseCodexResetsTimestamp(s string) *int64 {
	s = strings.TrimSpace(s)
	m := codexResetsDateTimeRe.FindStringSubmatch(s)
	if m == nil {
		return nil
	}
	now := time.Now()
	hour, _ := strconv.Atoi(m[1])
	min, _ := strconv.Atoi(m[2])
	ampm := strings.ToUpper(strings.TrimSpace(m[3]))
	if ampm == "AM" {
		if hour == 12 {
			hour = 0
		}
	} else if ampm == "PM" {
		if hour < 12 {
			hour += 12
		}
	}

	if m[4] != "" && m[5] != "" {
		day, _ := strconv.Atoi(m[4])
		month := monthMap[m[5]]
		if month == 0 {
			return nil
		}
		t := time.Date(now.Year(), month, day, hour, min, 0, 0, now.Location())
		if !t.After(now) {
			t = time.Date(now.Year()+1, month, day, hour, min, 0, 0, now.Location())
		}
		ts := t.Unix()
		return &ts
	}

	t := time.Date(now.Year(), now.Month(), now.Day(), hour, min, 0, 0, now.Location())
	if !t.After(now) {
		t = t.Add(24 * time.Hour)
	}
	ts := t.Unix()
	return &ts
}

// confirmCodexPrompts handles interactive prompts Codex shows on launch,
// such as workspace-trust confirmations ("Do you trust the contents of this directory?")
// or usage limit switch modals ("Automatically switched to ... due to usage limits" /
// "Press enter to confirm or esc to continue working").
func confirmCodexPrompts(session string) {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		text, err := captureTmuxPane(session)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		cleanText := stripAnsi(text)
		if strings.Contains(cleanText, "trust the contents of this directory") {
			run("tmux", "send-keys", "-t", session, "1", "Enter") //nolint
			time.Sleep(2 * time.Second)
			continue
		}
		if strings.Contains(cleanText, "esc to continue working") ||
			strings.Contains(cleanText, "Automatically switched to") ||
			strings.Contains(cleanText, "due to usage limits") {
			run("tmux", "send-keys", "-t", session, "Escape") //nolint
			time.Sleep(2 * time.Second)
			continue
		}
		break
	}
}
