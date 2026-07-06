package main

import (
	"encoding/base64"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

type execAgentRequest struct {
	TaskID       string   `json:"taskId"`
	Command      string   `json:"command"`
	Args         []string `json:"args,omitempty"`
	WorkDir      string   `json:"workDir"`
	Env          []string `json:"env,omitempty"`
	Prompt       string   `json:"prompt,omitempty"`
	PromptEnvVar string   `json:"promptEnvVar,omitempty"`
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

	env := req.Env
	var promptFile string
	if req.Prompt != "" && req.PromptEnvVar != "" {
		f, err := os.CreateTemp("", "arondo-prompt-*.txt")
		if err != nil {
			h.sendError(msg.ID, "INTERNAL", "failed to create prompt file: "+err.Error())
			return
		}
		if _, err := f.WriteString(req.Prompt); err != nil {
			f.Close()
			os.Remove(f.Name())
			h.sendError(msg.ID, "INTERNAL", "failed to write prompt file: "+err.Error())
			return
		}
		f.Close()
		promptFile = f.Name()
		env = append(env, req.PromptEnvVar+"="+promptFile)
	}

	var pid int
	pid, err = h.taskManager.Spawn(SpawnOptions{
		TaskID:  req.TaskID,
		Command: command,
		Args:    args,
		WorkDir: req.WorkDir,
		Env:     env,
		OnData: func(data []byte) {
			h.sendStream("exec.output", map[string]string{
				"taskId":   req.TaskID,
				"data":     base64.StdEncoding.EncodeToString(data),
				"encoding": "base64",
			})
		},
		OnExit: func(exitCode int) {
			if promptFile != "" {
				os.Remove(promptFile)
			}
			agyConvID := detectAgyConvIdByPid(pid)
			payload := map[string]any{
				"taskId":   req.TaskID,
				"exitCode": exitCode,
			}
			if agyConvID != "" {
				payload["agyConversationId"] = agyConvID
			}
			h.sendEvent("exec.exit", payload)
		},
	})

	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to start agent: "+err.Error())
		return
	}

	log.Printf("started agent task %s (pid=%d): %s", req.TaskID, pid, req.Command)
	h.sendResponse(msg.ID, execStartResponse{OK: true, TaskID: req.TaskID, PID: pid})
}

var convIDRe = regexp.MustCompile(`Created conversation ([0-9a-f-]{36})`)

func detectAgyConvIdByPid(pid int) string {
	if pid <= 0 {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	logDir := filepath.Join(home, ".gemini", "antigravity-cli", "log")
	files, err := ioutil.ReadDir(logDir)
	if err != nil {
		return ""
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime().After(files[j].ModTime())
	})

	pidStr := " " + strconv.Itoa(pid) + " "

	for _, file := range files {
		if file.IsDir() || !strings.HasPrefix(file.Name(), "cli-") || !strings.HasSuffix(file.Name(), ".log") {
			continue
		}
		path := filepath.Join(logDir, file.Name())
		contentBytes, err := ioutil.ReadFile(path)
		if err != nil {
			continue
		}
		content := string(contentBytes)

		if !strings.Contains(content, pidStr) {
			continue
		}

		match := convIDRe.FindStringSubmatch(content)
		if len(match) > 1 {
			return match[1]
		}
	}
	return ""
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

type shellSpawnRequest struct {
	TaskID  string `json:"taskId"`
	WorkDir string `json:"workDir"`
	Cols    uint16 `json:"cols,omitempty"`
	Rows    uint16 `json:"rows,omitempty"`
}

func (h *Handler) handleShellSpawn(msg *Message) {
	req, err := parsePayload[shellSpawnRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "bash"
	}

	pid, err := h.taskManager.Spawn(SpawnOptions{
		TaskID:  req.TaskID,
		Command: shell,
		Args:    []string{},
		WorkDir: req.WorkDir,
		Cols:    req.Cols,
		Rows:    req.Rows,
		OnData: func(data []byte) {
			h.sendStream("shell.output", map[string]string{
				"taskId":   req.TaskID,
				"data":     base64.StdEncoding.EncodeToString(data),
				"encoding": "base64",
			})
		},
		OnExit: func(exitCode int) {
			h.sendEvent("shell.exit", map[string]any{
				"taskId":   req.TaskID,
				"exitCode": exitCode,
			})
		},
	})

	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to start shell: "+err.Error())
		return
	}

	log.Printf("started shell task %s (pid=%d)", req.TaskID, pid)
	h.sendResponse(msg.ID, execStartResponse{OK: true, TaskID: req.TaskID, PID: pid})
}
