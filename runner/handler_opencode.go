package main

type opencodeSessionListRequest struct {
	WorkDir string `json:"workDir"`
}

type opencodeSessionListResponse struct {
	OK     bool   `json:"ok"`
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

// handleOpencodeSessionList runs `opencode session list --format json` so the
// server can match the --title it tagged a fresh run's session with and
// recover the session id OpenCode assigned it (never printed in plain-text
// run output) for later --session <id> resume.
func (h *Handler) handleOpencodeSessionList(msg *Message) {
	req, err := parsePayload[opencodeSessionListRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	cmd := execCommand("opencode", "session", "list", "--format", "json", "-n", "20")
	cmd.Dir = req.WorkDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		h.sendResponse(msg.ID, opencodeSessionListResponse{
			OK:     false,
			Output: string(out),
			Error:  err.Error(),
		})
		return
	}

	h.sendResponse(msg.ID, opencodeSessionListResponse{
		OK:     true,
		Output: string(out),
	})
}
