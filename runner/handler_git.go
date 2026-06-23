package main

import (
	"strings"
)

type gitWorkDirRequest struct {
	WorkDir string `json:"workDir"`
}

type gitStatusResponse struct {
	OK         bool   `json:"ok"`
	HasChanges bool   `json:"hasChanges"`
	IsGitRepo  bool   `json:"isGitRepo"`
	Error      string `json:"error,omitempty"`
}

type gitDiffResponse struct {
	OK         bool   `json:"ok"`
	HasChanges bool   `json:"hasChanges"`
	Diff       string `json:"diff"`
	HTML       string `json:"html,omitempty"`
}

type gitPrCreateRequest struct {
	WorkDir string `json:"workDir"`
	Title   string `json:"title"`
	Body    string `json:"body"`
}

type gitPrCreateResponse struct {
	OK    bool   `json:"ok"`
	PrURL string `json:"prUrl"`
}

func (h *Handler) handleGitStatus(msg *Message) {
	req, err := parsePayload[gitWorkDirRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	cmd := execCommand("git", "status", "--porcelain", ".")
	cmd.Dir = req.WorkDir
	out, err := cmd.CombinedOutput()

	if err != nil {
		errMsg := string(out) + err.Error()
		isNotGitRepo := strings.Contains(errMsg, "not a git repository") || strings.Contains(errMsg, "fatal:")
		h.sendResponse(msg.ID, gitStatusResponse{
			OK:         true,
			HasChanges: false,
			IsGitRepo:  !isNotGitRepo,
			Error:      errMsg,
		})
		return
	}

	h.sendResponse(msg.ID, gitStatusResponse{
		OK:         true,
		HasChanges: strings.TrimSpace(string(out)) != "",
		IsGitRepo:  true,
	})
}

func (h *Handler) handleGitDiff(msg *Message) {
	req, err := parsePayload[gitWorkDirRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	cmd := execCommand("git", "diff", "HEAD", "--", ".")
	cmd.Dir = req.WorkDir
	out, err := cmd.Output()

	if err != nil {
		// Fallback: try git diff without HEAD (for repos with no commits)
		cmd2 := execCommand("git", "diff", "--", ".")
		cmd2.Dir = req.WorkDir
		out2, err2 := cmd2.Output()
		if err2 != nil {
			h.sendError(msg.ID, "INTERNAL", "git diff failed: "+err.Error())
			return
		}
		out = out2
	}

	diff := string(out)
	var html string
	if len(out) > 0 {
		diff2htmlCmd := execCommand("diff2html", "-i", "stdin", "-o", "stdout")
		diff2htmlCmd.Dir = req.WorkDir
		diff2htmlCmd.Stdin = strings.NewReader(diff)
		htmlOut, err := diff2htmlCmd.Output()
		if err == nil {
			html = string(htmlOut)
		}
	}

	h.sendResponse(msg.ID, gitDiffResponse{
		OK:         true,
		HasChanges: strings.TrimSpace(diff) != "",
		Diff:       diff,
		HTML:       html,
	})
}

func (h *Handler) handleGitPrCreate(msg *Message) {
	req, err := parsePayload[gitPrCreateRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	// Get current branch
	branchCmd := execCommand("git", "branch", "--show-current")
	branchCmd.Dir = req.WorkDir
	branchOut, err := branchCmd.Output()
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to get branch: "+err.Error())
		return
	}
	branchName := strings.TrimSpace(string(branchOut))
	if branchName == "" {
		h.sendError(msg.ID, "INTERNAL", "could not detect current git branch")
		return
	}

	// Push branch
	pushCmd := execCommand("git", "push", "-u", "origin", branchName)
	pushCmd.Dir = req.WorkDir
	if out, err := pushCmd.CombinedOutput(); err != nil {
		h.sendError(msg.ID, "INTERNAL", "git push failed: "+string(out)+err.Error())
		return
	}

	// Create PR
	prCmd := execCommand("gh", "pr", "create",
		"--title", req.Title,
		"--body", req.Body,
		"--head", branchName,
	)
	prCmd.Dir = req.WorkDir
	prOut, err := prCmd.CombinedOutput()
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "gh pr create failed: "+string(prOut)+err.Error())
		return
	}

	// Extract PR URL
	prURL := ""
	for _, line := range strings.Split(string(prOut), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "https://github.com/") && strings.Contains(line, "/pull/") {
			prURL = line
			break
		}
	}
	if prURL == "" {
		prURL = strings.TrimSpace(string(prOut))
	}

	h.sendResponse(msg.ID, gitPrCreateResponse{
		OK:    true,
		PrURL: prURL,
	})
}
