package main

import (
	"encoding/base64"
	"log"
)

type ptyInputRequest struct {
	TaskID string `json:"taskId"`
	Data   string `json:"data"`
}

type ptyResizeRequest struct {
	TaskID string `json:"taskId"`
	Cols   uint16 `json:"cols"`
	Rows   uint16 `json:"rows"`
}

func (h *Handler) handlePtyInput(msg *Message) {
	req, err := parsePayload[ptyInputRequest](msg)
	if err != nil {
		log.Printf("pty.input: invalid payload: %v", err)
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	data := []byte(req.Data)

	if err := h.taskManager.WritePTY(req.TaskID, data); err != nil {
		log.Printf("pty.input: WritePTY error for task %s: %v", req.TaskID, err)
		h.sendError(msg.ID, "NOT_FOUND", err.Error())
		return
	}

	h.sendResponse(msg.ID, OkResponse{OK: true})
}

func (h *Handler) handlePtyResize(msg *Message) {
	req, err := parsePayload[ptyResizeRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	if err := h.taskManager.ResizePTY(req.TaskID, req.Cols, req.Rows); err != nil {
		h.sendError(msg.ID, "NOT_FOUND", err.Error())
		return
	}

	h.sendResponse(msg.ID, OkResponse{OK: true})
}

type ptyBufferRequest struct {
	TaskID string `json:"taskId"`
}

type ptyBufferResponse struct {
	OK   bool   `json:"ok"`
	Data string `json:"data"`
}

func (h *Handler) handlePtyBuffer(msg *Message) {
	req, err := parsePayload[ptyBufferRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	buf, err := h.taskManager.GetBuffer(req.TaskID)
	if err != nil {
		h.sendError(msg.ID, "NOT_FOUND", err.Error())
		return
	}

	h.sendResponse(msg.ID, ptyBufferResponse{
		OK:   true,
		Data: base64.StdEncoding.EncodeToString(buf),
	})
}
