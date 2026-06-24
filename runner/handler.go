package main

import (
	"encoding/json"
	"log"
)

type Handler struct {
	client      *Client
	taskManager *TaskManager
}

func NewHandler(client *Client) *Handler {
	return &Handler{
		client:      client,
		taskManager: NewTaskManager(),
	}
}

func (h *Handler) HandleMessage(msg *Message) {
	switch msg.Type {
	case TypeRequest:
		h.handleRequest(msg)
	case TypeEvent:
		h.handleEvent(msg)
	default:
		log.Printf("ignoring message type: %s", msg.Type)
	}
}

func (h *Handler) handleRequest(msg *Message) {
	switch msg.Method {
	case "fs.list":
		h.handleFsList(msg)
	case "exec.agent":
		h.handleExecAgent(msg)
	case "exec.script":
		h.handleExecScript(msg)
	case "exec.cancel":
		h.handleExecCancel(msg)
	case "pty.input":
		h.handlePtyInput(msg)
	case "pty.resize":
		h.handlePtyResize(msg)
	case "git.status":
		h.handleGitStatus(msg)
	case "git.diff":
		h.handleGitDiff(msg)
	case "git.pr.create":
		h.handleGitPrCreate(msg)
	default:
		h.sendError(msg.ID, "NOT_FOUND", "unknown method: "+msg.Method)
	}
}

func (h *Handler) handleEvent(msg *Message) {
	switch msg.Method {
	case "ping":
		pong, _ := NewEvent("pong", map[string]any{})
		h.client.Send(pong)
	case "connected":
		log.Println("server acknowledged connection")
		// Extract queryAgents from the payload and report which ones are
		// available on this runner's PATH.
		var connPayload struct {
			QueryAgents []string `json:"queryAgents"`
		}
		if err := parsePayloadInto(msg.Payload, &connPayload); err == nil && len(connPayload.QueryAgents) > 0 {
			if err := h.client.sendAgentStatus(connPayload.QueryAgents); err != nil {
				log.Printf("warning: failed to send agent.status: %v", err)
			}
		}
	default:
		log.Printf("ignoring event: %s", msg.Method)
	}
}

func (h *Handler) sendResponse(reqID string, payload any) {
	msg, err := NewResponse(reqID, payload)
	if err != nil {
		log.Printf("failed to marshal response: %v", err)
		return
	}
	if err := h.client.Send(msg); err != nil {
		log.Printf("failed to send response: %v", err)
	}
}

func (h *Handler) sendError(reqID, code, message string) {
	msg, err := NewErrorResponse(reqID, code, message)
	if err != nil {
		log.Printf("failed to marshal error response: %v", err)
		return
	}
	if err := h.client.Send(msg); err != nil {
		log.Printf("failed to send error response: %v", err)
	}
}

func (h *Handler) sendStream(method string, payload any) {
	msg, err := NewStream(method, payload)
	if err != nil {
		log.Printf("failed to marshal stream: %v", err)
		return
	}
	if err := h.client.Send(msg); err != nil {
		log.Printf("failed to send stream: %v", err)
	}
}

func (h *Handler) sendEvent(method string, payload any) {
	msg, err := NewEvent(method, payload)
	if err != nil {
		log.Printf("failed to marshal event: %v", err)
		return
	}
	if err := h.client.Send(msg); err != nil {
		log.Printf("failed to send event: %v", err)
	}
}

func parsePayload[T any](msg *Message) (T, error) {
	var v T
	err := json.Unmarshal(msg.Payload, &v)
	return v, err
}

// parsePayloadInto decodes raw JSON bytes into a target value.
// Use this when you already have a json.RawMessage and no *Message wrapper.
func parsePayloadInto(raw json.RawMessage, v any) error {
	return json.Unmarshal(raw, v)
}
