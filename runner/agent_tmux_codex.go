package main

import (
	"log"
	"os"
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
		return strings.Contains(text, "Account:") && strings.Contains(text, "Weekly limit")
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
	log.Printf("[quota/codex] week remain   : %s", fmtF(q.WeeklyRemain))
	log.Printf("[quota/codex] week resets   : %s", fmtI(q.WeeklyResetAt))
}

// CodexQuota holds parsed account and quota data from /status.
type CodexQuota struct {
	Account       string
	Plan          string
	DefaultModel  string
	WeeklyRemain  *float64 // 0-1, null if unavailable
	WeeklyResetAt *int64   // Unix timestamp, null if unavailable
}

var (
	codexAccountPlanRe = regexp.MustCompile(`Account:\s+(\S+@\S+)\s+\(([^)]+)\)`)
	codexModelRe       = regexp.MustCompile(`Model:\s+(.+)`)
	// e.g. "Weekly limit:  [███████░░░░░░░░░░░░░░] 36% left (resets 03:08 on 22 Mar)"
	codexWeeklyLimitRe = regexp.MustCompile(`Weekly limit:.*?(\d+)%\s+left\s+\(resets\s+([^)]+)\)`)
	// "03:08 on 22 Mar" — 24h clock, no timezone (server-local time).
	codexResetsDateRe = regexp.MustCompile(`^(\d{1,2}):(\d{2}) on (\d{1,2}) (\w{3})$`)
)

func parseCodexQuota(rawText string) *CodexQuota {
	text := stripAnsi(rawText)
	q := &CodexQuota{}

	if m := codexAccountPlanRe.FindStringSubmatch(text); m != nil {
		q.Account = m[1]
		q.Plan = m[2]
	}
	if m := codexModelRe.FindStringSubmatch(text); m != nil {
		q.DefaultModel = strings.TrimSpace(m[1])
	}
	if q.Account == "" {
		// /status never rendered (e.g. login/trust prompt blocked it) — nothing usable.
		return nil
	}

	if m := codexWeeklyLimitRe.FindStringSubmatch(text); m != nil {
		q.WeeklyRemain = pctToFloat(m[1])
		q.WeeklyResetAt = parseCodexResetsTimestamp(m[2])
	}

	return q
}

// parseCodexResetsTimestamp converts a string like "03:08 on 22 Mar" (24h
// clock, no timezone — codex reports in the local machine's timezone) to a
// Unix timestamp of the next occurrence.
func parseCodexResetsTimestamp(s string) *int64 {
	s = strings.TrimSpace(s)
	m := codexResetsDateRe.FindStringSubmatch(s)
	if m == nil {
		return nil
	}
	now := time.Now()
	hour, _ := strconv.Atoi(m[1])
	min, _ := strconv.Atoi(m[2])
	day, _ := strconv.Atoi(m[3])
	month := monthMap[m[4]]
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

// confirmCodexPrompts handles the workspace-trust confirmation Codex shows on
// first launch in a new directory ("Do you trust the contents of this
// directory?" / "1. Yes, continue").
func confirmCodexPrompts(session string) {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		text, err := captureTmuxPane(session)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		if !strings.Contains(stripAnsi(text), "trust the contents of this directory") {
			break
		}
		run("tmux", "send-keys", "-t", session, "1", "Enter") //nolint
		time.Sleep(3 * time.Second)
	}
}
