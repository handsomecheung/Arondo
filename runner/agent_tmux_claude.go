package main

import (
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

func fetchClaudeQuota(client *Client) {
	session := tmuxSessionName("claude", client)
	run("tmux", "kill-session", "-t", session) //nolint

	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("[quota/claude] failed to get cwd: %v", err)
		return
	}
	if err := run("tmux", "new-session", "-d", "-s", session, "-c", cwd, "-x", "220", "-y", "50", "claude"); err != nil {
		log.Printf("[quota/claude] failed to start tmux session: %v", err)
		return
	}
	defer run("tmux", "kill-session", "-t", session) //nolint

	time.Sleep(10 * time.Second)

	confirmClaudePrompts(session)

	if err := run("tmux", "send-keys", "-t", session, "/status", "Enter"); err != nil {
		log.Printf("[quota/claude] failed to send /status: %v", err)
		return
	}

	statusOutput, err := pollTmuxPane(session, 30*time.Second, func(text string) bool {
		return strings.Contains(text, "Login method") && strings.Contains(text, "Email")
	})
	if err != nil {
		log.Printf("[quota/claude] timed out waiting for status output: %v", err)
	}

	if path, werr := writeTmp("claude-status", statusOutput); werr != nil {
		log.Printf("[quota/claude] failed to write status output: %v", werr)
	} else {
		log.Printf("[quota/claude] status output saved to: %s", path)
	}

	// Press ESC to close the /status modal, then wait for the main screen to settle.
	run("tmux", "send-keys", "-t", session, "Escape", "") //nolint
	time.Sleep(2 * time.Second)

	if err := run("tmux", "send-keys", "-t", session, "/usage", "Enter"); err != nil {
		log.Printf("[quota/claude] failed to send /usage: %v", err)
		return
	}

	usageOutput, err := pollTmuxPane(session, 30*time.Second, func(text string) bool {
		return strings.Contains(text, "Current week") && strings.Contains(text, "Current session")
	})
	if err != nil {
		log.Printf("[quota/claude] timed out waiting for usage output: %v", err)
	}

	if path, werr := writeTmp("claude-usage", usageOutput); werr != nil {
		log.Printf("[quota/claude] failed to write usage output: %v", werr)
	} else {
		log.Printf("[quota/claude] usage output saved to: %s", path)
	}

	sq := parseClaudeStatus(statusOutput)
	uq := parseClaudeUsage(usageOutput)
	merged := *sq
	merged.HourRemain = uq.HourRemain
	merged.HourResetAt = uq.HourResetAt
	merged.WeekRemain = uq.WeekRemain
	merged.WeekResetsAt = uq.WeekResetsAt
	sendQuotaUpdate(client, "claude", &merged)
	log.Printf("[quota/claude] plan          : %s", sq.Plan)
	log.Printf("[quota/claude] account       : %s", sq.Account)
	log.Printf("[quota/claude] default model : %s", sq.DefaultModel)
	log.Printf("[quota/claude] hour remain   : %s", fmtF(uq.HourRemain))
	log.Printf("[quota/claude] hour resets   : %s", fmtI(uq.HourResetAt))
	log.Printf("[quota/claude] week remain   : %s", fmtF(uq.WeekRemain))
	log.Printf("[quota/claude] week resets   : %s", fmtI(uq.WeekResetsAt))
}

// ClaudeQuota holds parsed account and quota data from /status and /usage.
type ClaudeQuota struct {
	Plan          string
	Account       string
	DefaultModel  string
	HourRemain    *float64 // 0-1, null if unavailable
	HourResetAt   *int64   // Unix timestamp, null if unavailable
	WeekRemain    *float64
	WeekResetsAt    *int64
}

var (
	claudeLoginRe  = regexp.MustCompile(`Login method:\s+(.+)`)
	claudeEmailRe  = regexp.MustCompile(`Email:\s+(\S+@\S+)`)
	claudeModelRe  = regexp.MustCompile(`Model:\s+(.+)`)
	claudeUsedRe   = regexp.MustCompile(`(\d+)%\s+used`)
	claudeResetsRe = regexp.MustCompile(`^Resets (.+)`)
)

func parseClaudeStatus(text string) *ClaudeQuota {
	q := &ClaudeQuota{}
	if m := claudeLoginRe.FindStringSubmatch(text); m != nil {
		q.Plan = strings.TrimSpace(m[1])
	}
	if m := claudeEmailRe.FindStringSubmatch(text); m != nil {
		q.Account = m[1]
	}
	if m := claudeModelRe.FindStringSubmatch(text); m != nil {
		q.DefaultModel = strings.TrimSpace(m[1])
	}
	return q
}

func parseClaudeUsage(text string) *ClaudeQuota {
	q := &ClaudeQuota{}
	section := ""
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		switch {
		case strings.HasPrefix(line, "Current session"):
			section = "session"
		case strings.HasPrefix(line, "Current week (all models)"):
			section = "week"
		case strings.HasPrefix(line, "Current week"):
			// e.g. "Current week (Fable)" is a separate per-model quota we don't track.
			section = ""
		default:
			if m := claudeUsedRe.FindStringSubmatch(line); m != nil {
				if f := pctToFloat(m[1]); f != nil {
					remain := floatPtr(1.0 - *f)
					switch section {
					case "session":
						q.HourRemain = remain
					case "week":
						q.WeekRemain = remain
					}
				}
			} else if m := claudeResetsRe.FindStringSubmatch(line); m != nil {
				ts := parseResetsTimestamp(strings.TrimSpace(m[1]))
				switch section {
				case "session":
					q.HourResetAt = ts
				case "week":
					q.WeekResetsAt = ts
				}
			}
		}
	}
	return q
}

// confirmClaudePrompts handles interactive confirmation dialogs that Claude
// shows on first run (folder trust check, external CLAUDE.md import check).
func confirmClaudePrompts(session string) {
	confirmKeywords := []string{
		"I trust this folder",
		"trust this folder",
		"Yes, I trust",
		"Yes, allow external",
		"Allow external",
	}
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		out, err := exec.Command("tmux", "capture-pane", "-t", session, "-p").Output()
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		text := string(out)
		found := false
		for _, kw := range confirmKeywords {
			if strings.Contains(text, kw) {
				found = true
				break
			}
		}
		if !found {
			break
		}
		run("tmux", "send-keys", "-t", session, "1", "Enter") //nolint
		time.Sleep(3 * time.Second)
	}
}
