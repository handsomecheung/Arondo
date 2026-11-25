package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

const skillsCLIVersion = "1.9.0"

var skillInstallMu sync.Mutex
var skillNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

type skillsInstallRequest struct {
	Source  string   `json:"source"`
	Skill   string   `json:"skill"`
	Agents  []string `json:"agents"`
	Replace bool     `json:"replace"`
}

type skillInstallResult struct {
	Agent  string `json:"agent"`
	Status string `json:"status"`
	Output string `json:"output"`
}

func skillAgentPaths(home string) map[string]string {
	claudeHome := os.Getenv("CLAUDE_CONFIG_DIR")
	if claudeHome == "" {
		claudeHome = filepath.Join(home, ".claude")
	}
	return map[string]string{
		"codex":           filepath.Join(home, ".agents", "skills"),
		"pi":              filepath.Join(home, ".agents", "skills"),
		"claude-code":     filepath.Join(claudeHome, "skills"),
		"opencode":        filepath.Join(home, ".agents", "skills"),
		"antigravity-cli": filepath.Join(home, ".gemini", "config", "skills"),
	}
}

func validateSkillRequest(req skillsInstallRequest) error {
	if strings.TrimSpace(req.Source) == "" || len(req.Source) > 2048 || strings.HasPrefix(strings.TrimSpace(req.Source), "-") || strings.ContainsAny(req.Source, "\x00\n\r\t") || !skillNamePattern.MatchString(req.Skill) {
		return fmt.Errorf("invalid skill source or name")
	}
	paths := skillAgentPaths("")
	seen := map[string]bool{}
	if len(req.Agents) == 0 || len(req.Agents) > len(paths) {
		return fmt.Errorf("select supported agents")
	}
	for _, agent := range req.Agents {
		if _, ok := paths[agent]; !ok || seen[agent] {
			return fmt.Errorf("invalid or duplicate agent: %s", agent)
		}
		seen[agent] = true
	}
	return nil
}

func skillInstallName(name string) string {
	return strings.TrimRight(strings.ToLower(name), ".-")
}

func (h *Handler) handleSkillsInstall(msg *Message) {
	req, err := parsePayload[skillsInstallRequest](msg)
	if err == nil {
		err = validateSkillRequest(req)
	}
	if err != nil {
		h.sendError(msg.ID, "BAD_REQUEST", err.Error())
		return
	}
	if !skillInstallMu.TryLock() {
		h.sendError(msg.ID, "BUSY", "Another skill installation is running on this runner.")
		return
	}
	h.taskManager.activity.retainProcess()
	go func() {
		defer skillInstallMu.Unlock()
		defer h.taskManager.activity.end()
		results := installSkills(req, h.client.done)
		h.sendResponse(msg.ID, map[string]any{"results": results})
	}()
}

func installSkills(req skillsInstallRequest, done <-chan struct{}) []skillInstallResult {
	results := make([]skillInstallResult, 0, len(req.Agents))
	home, err := os.UserHomeDir()
	paths := skillAgentPaths(home)
	canonical := filepath.Join(home, ".agents", "skills", skillInstallName(req.Skill))
	_, canonicalErr := os.Lstat(canonical)
	canonicalExists := canonicalErr == nil
	if err == nil && canonicalErr != nil && !os.IsNotExist(canonicalErr) {
		err = canonicalErr
	}
	installed := make(map[string]skillInstallResult)
	for _, agent := range req.Agents {
		destination := filepath.Join(paths[agent], skillInstallName(req.Skill))
		if previous, ok := installed[destination]; ok {
			previous.Agent = agent
			results = append(results, previous)
			continue
		}
		result := skillInstallResult{Agent: agent, Status: "failed"}
		if err != nil {
			result.Output = err.Error()
		} else {
			result.Output, result.Status = installSkillTarget(req, agent, home, destination, canonical, canonicalExists, done)
		}
		installed[destination] = result
		results = append(results, result)
	}
	return results
}

func installSkillTarget(req skillsInstallRequest, agent, home, destination, canonical string, canonicalExists bool, done <-chan struct{}) (string, string) {
	if !req.Replace {
		if _, err := os.Lstat(destination); err == nil {
			return destination + " already exists. Skipped without changing files. Enable Replace existing skill to update it.", "skipped"
		} else if !os.IsNotExist(err) {
			return err.Error(), "failed"
		}
		if canonicalExists {
			if _, err := os.Stat(filepath.Join(canonical, "SKILL.md")); err != nil {
				return "Cannot link existing shared skill: " + err.Error(), "failed"
			}
			if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
				return err.Error(), "failed"
			}
			if err := os.Symlink(canonical, destination); err != nil {
				return err.Error(), "failed"
			}
			return "Linked " + destination + " to the existing shared skill at " + canonical + " without replacing its contents.", "success"
		}
	}
	return runSkillInstall(req, agent, home, done)
}

func runSkillInstall(req skillsInstallRequest, agent, home string, done <-chan struct{}) (string, string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	go func() {
		select {
		case <-done:
			cancel()
		case <-ctx.Done():
		}
	}()
	source := strings.TrimSpace(req.Source)
	if strings.HasPrefix(source, "~/") {
		source = filepath.Join(home, source[2:])
	}
	cmd := exec.CommandContext(ctx, "npx", "--yes", "skills@"+skillsCLIVersion, "add", source, "--skill", req.Skill, "--rename", skillInstallName(req.Skill), "--global", "--agent", agent, "--yes", "--json")
	cmd.Dir = home
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "DISABLE_TELEMETRY=1", "GIT_TERMINAL_PROMPT=0", "npm_config_update_notifier=false")
	cmd.WaitDelay = 2 * time.Second
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	output := &skillOutput{}
	diagnostics := &skillOutput{}
	cmd.Stdout, cmd.Stderr = output, diagnostics
	err := cmd.Run()
	log := diagnostics.text + output.text
	if err != nil {
		if ctx.Err() != nil {
			return log + "\nInstallation stopped: " + ctx.Err().Error(), "failed"
		}
		return log + "\n" + err.Error(), "failed"
	}
	var installed []struct {
		Name   string `json:"name"`
		Status string `json:"status"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal([]byte(output.text), &installed); err != nil || len(installed) != 1 || installed[0].Status != "installed" || installed[0].Name != skillInstallName(req.Skill) || installed[0].Path == "" {
		return log + "\nThe Skills CLI did not report a successful installation of the requested skill.", "failed"
	}
	return log, "success"
}

type skillOutput struct{ text string }

func (b *skillOutput) Write(p []byte) (int, error) {
	const max = 32 * 1024
	b.text += string(p)
	if len(b.text) > max {
		b.text = b.text[len(b.text)-max:]
	}
	return len(p), nil
}
