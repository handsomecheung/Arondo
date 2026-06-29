package main

import (
	"os"
	"path/filepath"
	"strings"
)

type rulesSyncRequest struct {
	Content string `json:"content"`
}

type rulesSyncResponse struct {
	OK bool `json:"ok"`
}

func (h *Handler) handleRulesSync(msg *Message) {
	req, err := parsePayload[rulesSyncRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		h.sendResponse(msg.ID, rulesSyncResponse{OK: true})
		return
	}

	wrapped := "<!-- arondo:start -->\n" + content + "\n<!-- arondo:end -->"

	home, err := os.UserHomeDir()
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to get user home dir: "+err.Error())
		return
	}

	targets := []string{
		filepath.Join(home, ".gemini", "GEMINI.md"),
		filepath.Join(home, ".claude", "CLAUDE.md"),
	}

	for _, target := range targets {
		dir := filepath.Dir(target)
		if err := os.MkdirAll(dir, 0755); err != nil {
			h.sendError(msg.ID, "INTERNAL", "failed to create directory: "+err.Error())
			return
		}

		var existing string
		if _, err := os.Stat(target); err == nil {
			data, err := os.ReadFile(target)
			if err != nil {
				h.sendError(msg.ID, "INTERNAL", "failed to read existing file: "+err.Error())
				return
			}
			existing = string(data)
		}

		if strings.Contains(existing, wrapped) {
			continue
		}

		startIdx := strings.Index(existing, "<!-- arondo:start -->")
		endIdx := strings.Index(existing, "<!-- arondo:end -->")
		if startIdx != -1 && endIdx != -1 && startIdx < endIdx {
			endPos := endIdx + len("<!-- arondo:end -->")
			existing = existing[:startIdx] + existing[endPos:]
		}

		existingClean := strings.TrimRight(existing, " \t\r\n")
		var newContent string
		if existingClean == "" {
			newContent = wrapped + "\n"
		} else {
			newContent = existingClean + "\n\n" + wrapped + "\n"
		}

		if err := os.WriteFile(target, []byte(newContent), 0644); err != nil {
			h.sendError(msg.ID, "INTERNAL", "failed to write file: "+err.Error())
			return
		}
	}

	h.sendResponse(msg.ID, rulesSyncResponse{OK: true})
}
