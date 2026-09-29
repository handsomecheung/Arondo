package main

import (
	"regexp"
	"strings"
)

var (
	// ansiRegex matches standard ANSI and terminal control escape sequences.
	ansiRegex = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)

	// sudoPromptRegex matches sudo password prompts (e.g., "[sudo] password for user:", "[sudo] user のパスワード:").
	sudoPromptRegex = regexp.MustCompile(`(?i)^\[sudo\]\s*(?:(?:password|パスワード|密码)(?:\s+(?:for|の|为)\s+.+?)?|.+?\s+(?:のパスワード|的密码))\s*[:：]\s*$`)
)

// isMatchingPasswordPrompt checks if the trailing non-empty line of the buffer matches a password prompt.
func isMatchingPasswordPrompt(buffer []byte) bool {
	if len(buffer) == 0 {
		return false
	}
	if len(buffer) > 1024 {
		buffer = buffer[len(buffer)-1024:]
	}
	text := ansiRegex.ReplaceAllString(string(buffer), "")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		return sudoPromptRegex.MatchString(line)
	}
	return false
}
