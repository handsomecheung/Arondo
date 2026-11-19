package main

import "log"

func (h *Handler) handleRunnerUpdate(msg *Message) {
	var payload runnerUpdate
	if err := parsePayloadInto(msg.Payload, &payload); err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}
	if payload.Version == "" || payload.DownloadURL == "" {
		h.sendError(msg.ID, "INTERNAL", "version and downloadUrl are required")
		return
	}
	h.sendResponse(msg.ID, OkResponse{OK: true})
	if !h.autoUpdate {
		log.Printf("runner update available (v%s); please update your runner: %s (automatic updates disabled; enable with --auto-update=true)", payload.Version, payload.DownloadURL)
		return
	}
	h.updater.schedule(payload)
}
