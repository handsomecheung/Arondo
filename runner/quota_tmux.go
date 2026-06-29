package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// tmuxSessionName builds a unique tmux session name for the given agent and
// client, safe for multiple runners on the same host. Format:
// arondo-{agent}-{name}_{hostname} with special characters replaced by "_".
func tmuxSessionName(agent string, client *Client) string {
	hostname, _ := os.Hostname()
	raw := fmt.Sprintf("arondo-%s-%s_%s", agent, client.name, hostname)
	return strings.NewReplacer("@", "_", ".", "_", "/", "_", ":", "_").Replace(raw)
}

// captureTmuxPane returns the full scrollback content of a tmux session pane.
func captureTmuxPane(session string) (string, error) {
	out, err := exec.Command("tmux", "capture-pane", "-t", session, "-p", "-S", "-").Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// pollTmuxPane polls the pane every 2s until ready(text) is true or timeout expires.
func pollTmuxPane(session string, timeout time.Duration, ready func(string) bool) (string, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(2 * time.Second)
		out, err := exec.Command("tmux", "capture-pane", "-t", session, "-p", "-S", "-").Output()
		if err != nil {
			continue
		}
		text := string(out)
		if ready(text) {
			return text, nil
		}
	}
	out, _ := exec.Command("tmux", "capture-pane", "-t", session, "-p", "-S", "-").Output()
	return string(out), &timeoutError{}
}

// sendQuotaUpdate sends a quota.update event to the server, retrying until the
// client is connected (up to 60 s to allow for initial connection delay).
func sendQuotaUpdate(client *Client, agent string, quota any) {
	msg, err := NewEvent("quota.update", map[string]any{
		"agent": agent,
		"quota": quota,
	})
	if err != nil {
		log.Printf("[quota/%s] failed to build event: %v", agent, err)
		return
	}
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		if err := client.Send(msg); err == nil {
			log.Printf("[quota/%s] quota.update sent", agent)
			return
		}
		time.Sleep(2 * time.Second)
	}
	log.Printf("[quota/%s] failed to send quota.update: client not connected", agent)
}

func writeTmp(label, content string) (string, error) {
	f, err := os.CreateTemp("", fmt.Sprintf("arondo-%s-*.txt", label))
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.WriteString(content); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// pctToFloat converts a percentage string like "79" to a *float64 value 0.79.
// Returns nil for empty or unparseable input.
func pctToFloat(pct string) *float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(pct), 64)
	if err != nil {
		return nil
	}
	v := f / 100
	return &v
}

func floatPtr(v float64) *float64 { return &v }

// parseDurationTimestamp converts a duration string like "107h 56m" to a Unix
// timestamp representing now + that duration. Returns nil for empty/invalid input.
func parseDurationTimestamp(s string) *int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	m := durationRe.FindStringSubmatch(s)
	if m == nil || (m[1] == "" && m[2] == "") {
		return nil
	}
	var total int64
	if m[1] != "" {
		h, _ := strconv.ParseInt(m[1], 10, 64)
		total += h * 3600
	}
	if m[2] != "" {
		min, _ := strconv.ParseInt(m[2], 10, 64)
		total += min * 60
	}
	ts := time.Now().Unix() + total
	return &ts
}

// parseResetsTimestamp converts strings like "3am (Asia/Tokyo)" or
// "Jul 1, 5am (Asia/Tokyo)" to a Unix timestamp. Returns nil on failure.
func parseResetsTimestamp(s string) *int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	tzMatch := resetsTimezoneRe.FindStringSubmatch(s)
	if tzMatch == nil {
		return nil
	}
	loc, err := time.LoadLocation(tzMatch[1])
	if err != nil {
		return nil
	}
	now := time.Now().In(loc)

	// "Jul 1, 4:59am (Asia/Tokyo)" or "Jul 1, 5am (Asia/Tokyo)"
	if m := resetsDateRe.FindStringSubmatch(s); m != nil {
		month := monthMap[m[1]]
		day, _ := strconv.Atoi(m[2])
		hour, _ := strconv.Atoi(m[3])
		min, _ := strconv.Atoi(m[4]) // empty string → 0
		hour = ampmToHour(hour, m[5])
		t := time.Date(now.Year(), month, day, hour, min, 0, 0, loc)
		if !t.After(now) {
			t = time.Date(now.Year()+1, month, day, hour, min, 0, 0, loc)
		}
		ts := t.Unix()
		return &ts
	}

	// "2:59am (Asia/Tokyo)" or "3am (Asia/Tokyo)"
	if m := resetsTimeRe.FindStringSubmatch(s); m != nil {
		hour, _ := strconv.Atoi(m[1])
		min, _ := strconv.Atoi(m[2]) // empty string → 0
		hour = ampmToHour(hour, m[3])
		t := time.Date(now.Year(), now.Month(), now.Day(), hour, min, 0, 0, loc)
		if !t.After(now) {
			t = t.Add(24 * time.Hour)
		}
		ts := t.Unix()
		return &ts
	}

	return nil
}

func ampmToHour(hour int, ampm string) int {
	if ampm == "am" {
		if hour == 12 {
			return 0
		}
		return hour
	}
	if hour == 12 {
		return 12
	}
	return hour + 12
}

var (
	durationRe       = regexp.MustCompile(`^(?:(\d+)h)?\s*(?:(\d+)m)?$`)
	resetsTimezoneRe = regexp.MustCompile(`\(([^)]+)\)`)
	resetsDateRe     = regexp.MustCompile(`^(\w{3}) (\d{1,2}), (\d{1,2})(?::(\d{2}))?(am|pm)`)
	resetsTimeRe     = regexp.MustCompile(`^(\d{1,2})(?::(\d{2}))?(am|pm)`)
	monthMap         = map[string]time.Month{
		"Jan": time.January, "Feb": time.February, "Mar": time.March,
		"Apr": time.April, "May": time.May, "Jun": time.June,
		"Jul": time.July, "Aug": time.August, "Sep": time.September,
		"Oct": time.October, "Nov": time.November, "Dec": time.December,
	}
)

// fmtF formats a nullable float for logging.
func fmtF(f *float64) string {
	if f == nil {
		return "null"
	}
	return strconv.FormatFloat(*f, 'g', -1, 64)
}

// fmtI formats a nullable int64 (Unix timestamp) for logging.
func fmtI(i *int64) string {
	if i == nil {
		return "null"
	}
	return strconv.FormatInt(*i, 10)
}

func run(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}

type timeoutError struct{}

func (e *timeoutError) Error() string { return "timeout" }
