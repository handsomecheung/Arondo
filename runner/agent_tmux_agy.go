package main

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"time"
)

func fetchAgyQuota(client *Client) {
	session := tmuxSessionName("agy", client)
	run("tmux", "kill-session", "-t", session) //nolint

	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("[quota/agy] failed to get cwd: %v", err)
		return
	}
	agyCmd := fmt.Sprintf("agy --add-dir %q", cwd)
	if err := run("tmux", "new-session", "-d", "-s", session, "-x", "220", "-y", "50", agyCmd); err != nil {
		log.Printf("[quota/agy] failed to start tmux session: %v", err)
		return
	}
	defer run("tmux", "kill-session", "-t", session) //nolint

	time.Sleep(10 * time.Second)

	if _, err := captureTmuxPane(session); err != nil {
		log.Printf("[quota/agy] failed to capture initial pane: %v", err)
	}

	if err := run("tmux", "send-keys", "-t", session, "/usage", "Enter"); err != nil {
		log.Printf("[quota/agy] failed to send /usage: %v", err)
		return
	}

	output, err := pollTmuxPane(session, 30*time.Second, func(text string) bool {
		return strings.Contains(text, "Usage") || strings.Contains(text, "Quota") || strings.Contains(text, "quota")
	})
	if err != nil {
		log.Printf("[quota/agy] timed out waiting for quota output: %v", err)
	}

	if path, werr := writeTmp("agy-usage", output); werr != nil {
		log.Printf("[quota/agy] failed to write usage output: %v", werr)
	} else {
		log.Printf("[quota/agy] usage output saved to: %s", path)
	}

	if q := parseAgyQuota(output); q != nil {
		sendQuotaUpdate(client, "agy", q)
		log.Printf("[quota/agy] account       : %s", q.Account)
		log.Printf("[quota/agy] plan          : %s", q.Plan)
		log.Printf("[quota/agy] default model : %s", q.DefaultModel)
		log.Printf("[quota/agy] gemini weekly  remaining : %s", fmtF(q.GeminiWeeklyRemain))
		log.Printf("[quota/agy] gemini weekly  refreshes : %s", fmtI(q.GeminiWeeklyResetsAt))
		log.Printf("[quota/agy] gemini hour    remaining : %s", fmtF(q.GeminiHourRemain))
		log.Printf("[quota/agy] gemini hour    refreshes : %s", fmtI(q.GeminiHourResetsAt))
		log.Printf("[quota/agy] other  weekly  remaining : %s", fmtF(q.OtherWeeklyRemain))
		log.Printf("[quota/agy] other  weekly  refreshes : %s", fmtI(q.OtherWeeklyResetsAt))
		log.Printf("[quota/agy] other  hour    remaining : %s", fmtF(q.OtherHourRemain))
		log.Printf("[quota/agy] other  hour    refreshes : %s", fmtI(q.OtherHourResetsAt))
	}
}

// AgyQuota holds parsed quota data from the /usage command.
type AgyQuota struct {
	Account               string
	Plan                  string
	DefaultModel          string
	GeminiWeeklyRemain    *float64 // 0-1, null if unavailable
	GeminiWeeklyResetsAt   *int64
	GeminiHourRemain      *float64
	GeminiHourResetsAt     *int64
	OtherWeeklyRemain     *float64
	OtherWeeklyResetsAt    *int64
	OtherHourRemain       *float64
	OtherHourResetsAt      *int64
}

var (
	accountPlanRe  = regexp.MustCompile(`(\S+@\S+)\s+\(([^)]+)\)`)
	defaultModelRe = regexp.MustCompile(`(?m)esc to cancel\s+(\S.*?)\s*$`)
	remainRe       = regexp.MustCompile(`(\d+(?:\.\d+)?)\s*%\s+remaining\s+·\s+Refreshes in\s+(.+)`)
	refreshOnlyRe  = regexp.MustCompile(`^Refreshes in\s+(.+)`)
)

func parseAgyQuota(text string) *AgyQuota {
	q := &AgyQuota{}

	if m := accountPlanRe.FindStringSubmatch(text); m != nil {
		q.Account = m[1]
		q.Plan = m[2]
	}
	if m := defaultModelRe.FindStringSubmatch(text); m != nil {
		q.DefaultModel = strings.TrimSpace(m[1])
	}

	var section, limitType string
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		switch {
		case line == "GEMINI MODELS":
			section, limitType = "gemini", ""
		case strings.HasSuffix(line, "MODELS") && line != "GEMINI MODELS":
			section, limitType = "other", ""
		case line == "Weekly Limit":
			limitType = "weekly"
		case line == "Five Hour Limit":
			limitType = "fivehour"
		case line == "Quota available":
			applyAgyLimit(q, section, limitType, floatPtr(1.0), nil)
		case strings.HasPrefix(line, "Disabled:"):
			applyAgyLimit(q, section, limitType, nil, nil)
		default:
			if m := remainRe.FindStringSubmatch(line); m != nil {
				applyAgyLimit(q, section, limitType,
					pctToFloat(m[1]),
					parseDurationTimestamp(strings.TrimSpace(m[2])),
				)
			} else if m := refreshOnlyRe.FindStringSubmatch(line); m != nil {
				applyAgyLimit(q, section, limitType,
					floatPtr(0.0),
					parseDurationTimestamp(strings.TrimSpace(m[1])),
				)
			}
		}
	}
	return q
}

func applyAgyLimit(q *AgyQuota, section, limitType string, remain *float64, refresh *int64) {
	switch section + "+" + limitType {
	case "gemini+weekly":
		q.GeminiWeeklyRemain, q.GeminiWeeklyResetsAt = remain, refresh
	case "gemini+fivehour":
		q.GeminiHourRemain, q.GeminiHourResetsAt = remain, refresh
	case "other+weekly":
		q.OtherWeeklyRemain, q.OtherWeeklyResetsAt = remain, refresh
	case "other+fivehour":
		q.OtherHourRemain, q.OtherHourResetsAt = remain, refresh
	}
}
