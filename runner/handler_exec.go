package main

import (
	"encoding/base64"
	"log"
	"strings"
	"syscall"
)

type execAgentRequest struct {
	TaskID  string   `json:"taskId"`
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	WorkDir string   `json:"workDir"`
	Env     []string `json:"env,omitempty"`
}

type execScriptRequest struct {
	TaskID  string `json:"taskId"`
	Command string `json:"command"`
	WorkDir string `json:"workDir"`
	Cols    uint16 `json:"cols,omitempty"`
	Rows    uint16 `json:"rows,omitempty"`
}

type execCancelRequest struct {
	TaskID string `json:"taskId"`
	Signal string `json:"signal,omitempty"`
}

type execStartResponse struct {
	OK     bool   `json:"ok"`
	TaskID string `json:"taskId"`
	PID    int    `json:"pid"`
}

func (h *Handler) handleExecAgent(msg *Message) {
	req, err := parsePayload[execAgentRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	command := req.Command
	args := req.Args
	if len(args) == 0 && command != "" {
		args = []string{"-c", command}
		command = "bash"
	}

	pid, err := h.taskManager.Spawn(SpawnOptions{
		TaskID:  req.TaskID,
		Command: command,
		Args:    args,
		WorkDir: req.WorkDir,
		Env:     req.Env,
		OnData: func(data []byte) {
			h.sendStream("exec.output", map[string]string{
				"taskId":   req.TaskID,
				"data":     base64.StdEncoding.EncodeToString(data),
				"encoding": "base64",
			})
		},
		OnExit: func(exitCode int) {
			h.sendEvent("exec.exit", map[string]any{
				"taskId":   req.TaskID,
				"exitCode": exitCode,
			})
		},
	})

	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to start agent: "+err.Error())
		return
	}

	log.Printf("started agent task %s (pid=%d): %s", req.TaskID, pid, req.Command)
	h.sendResponse(msg.ID, execStartResponse{OK: true, TaskID: req.TaskID, PID: pid})
}

func (h *Handler) handleExecScript(msg *Message) {
	req, err := parsePayload[execScriptRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	pid, err := h.taskManager.Spawn(SpawnOptions{
		TaskID:  req.TaskID,
		Command: "bash",
		Args:    []string{"-c", req.Command},
		WorkDir: req.WorkDir,
		Cols:    req.Cols,
		Rows:    req.Rows,
		OnData: func(data []byte) {
			h.sendStream("exec.output", map[string]string{
				"taskId":   req.TaskID,
				"data":     base64.StdEncoding.EncodeToString(data),
				"encoding": "base64",
			})
		},
		OnExit: func(exitCode int) {
			h.sendEvent("exec.exit", map[string]any{
				"taskId":   req.TaskID,
				"exitCode": exitCode,
			})
		},
	})

	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to start script: "+err.Error())
		return
	}

	log.Printf("started script task %s (pid=%d): %s", req.TaskID, pid, req.Command)
	h.sendResponse(msg.ID, execStartResponse{OK: true, TaskID: req.TaskID, PID: pid})
}

func (h *Handler) handleExecCancel(msg *Message) {
	req, err := parsePayload[execCancelRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	sig := syscall.SIGTERM
	if strings.ToUpper(req.Signal) == "SIGKILL" {
		sig = syscall.SIGKILL
	}

	if err := h.taskManager.Kill(req.TaskID, sig); err != nil {
		h.sendError(msg.ID, "NOT_FOUND", err.Error())
		return
	}

	log.Printf("cancelled task %s with signal %v", req.TaskID, sig)
	h.sendResponse(msg.ID, OkResponse{OK: true})
}

type execRestartRequest struct {
	TaskID  string `json:"taskId"`
	Command string `json:"command"`
	WorkDir string `json:"workDir"`
	Cols    uint16 `json:"cols,omitempty"`
	Rows    uint16 `json:"rows,omitempty"`
}

func (h *Handler) handleExecRestart(msg *Message) {
	req, err := parsePayload[execRestartRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	pid, err := h.taskManager.Restart(req.TaskID, req.Command, req.WorkDir, req.Cols, req.Rows)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to restart: "+err.Error())
		return
	}

	log.Printf("restarted script task %s (new pid=%d)", req.TaskID, pid)
	h.sendResponse(msg.ID, execStartResponse{OK: true, TaskID: req.TaskID, PID: pid})
}
