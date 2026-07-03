package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
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

	untrackedCmd := execCommand("git", "ls-files", "--others", "--exclude-standard", ".")
	untrackedCmd.Dir = req.WorkDir
	if untrackedOut, err := untrackedCmd.Output(); err == nil {
		for _, f := range strings.Split(strings.TrimSpace(string(untrackedOut)), "\n") {
			f = strings.TrimSpace(f)
			if f == "" {
				continue
			}
			diff += buildNewFileDiff(req.WorkDir, f)
		}
	}

	h.sendResponse(msg.ID, gitDiffResponse{
		OK:         true,
		HasChanges: strings.TrimSpace(diff) != "",
		Diff:       diff,
	})
}

func buildNewFileDiff(workDir, filePath string) string {
	content, err := os.ReadFile(filepath.Join(workDir, filePath))
	if err != nil {
		return ""
	}

	if bytes.IndexByte(content, 0) >= 0 {
		return fmt.Sprintf("diff --git a/%s b/%s\nnew file mode 100644\nBinary files /dev/null and b/%s differ\n",
			filePath, filePath, filePath)
	}

	text := string(content)
	lines := strings.Split(text, "\n")
	endsWithNewline := strings.HasSuffix(text, "\n")
	if endsWithNewline && len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	var b strings.Builder
	fmt.Fprintf(&b, "diff --git a/%s b/%s\n", filePath, filePath)
	b.WriteString("new file mode 100644\n")
	b.WriteString("--- /dev/null\n")
	fmt.Fprintf(&b, "+++ b/%s\n", filePath)
	fmt.Fprintf(&b, "@@ -0,0 +1,%d @@\n", len(lines))
	for i, line := range lines {
		fmt.Fprintf(&b, "+%s\n", line)
		if i == len(lines)-1 && !endsWithNewline {
			b.WriteString("\\ No newline at end of file\n")
		}
	}
	return b.String()
}


