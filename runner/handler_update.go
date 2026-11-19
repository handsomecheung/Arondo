package main

import "log"

func (h *Handler) handleRunnerUpdate(msg *Message) {
	var payload struct {
		Version     string `json:"version"`
		DownloadURL string `json:"downloadUrl"`
	}
	if err := parsePayloadInto(msg.Payload, &payload); err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}
	if payload.Version == "" || payload.DownloadURL == "" {
		h.sendError(msg.ID, "INTERNAL", "version and downloadUrl are required")
		return
	}
	log.Printf("runner update available (v%s); please update your runner: %s", payload.Version, payload.DownloadURL)
	h.sendResponse(msg.ID, OkResponse{OK: true})
}
