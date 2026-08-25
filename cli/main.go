package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const usage = `Create a session, send a message, poll until it finishes, and print the result.

Usage:
  cli/arondo-cli send \
    --server http://localhost:3251 \
    --token <client_access_token> \
    --temp-dir \
    "Print the current date"

  cli/arondo-cli send \
    --server http://localhost:3251 \
    --token <client_access_token> \
    --resume \
    "Now also print the current directory"

Options:
  --server <url>               Arondo server base URL (overrides ARONDO_URL and cli.url in arondo.json)
  --token <token>              Client access token (overrides ARONDO_TOKEN and cli.token in arondo.json)
  --runner-id <id>             Target runner ID (default: connected runner with the current hostname)
  --path <path>                Repository path on the runner (default: current working directory)
  --temp-dir                   Create the session in a fresh temporary directory on the runner
  --session-id <id>            Send the message to an existing session
  --resume                     Resume the most recently updated session for the runner and repository path
  --force                      Bypass the dirty-working-tree confirmation
  --agent <type>               auto, antigravity, claude, codex, or opencode (default: auto)
  --poll-interval <seconds>    Seconds between status polls (default: 3)
  --timeout <seconds>          Maximum seconds to wait for completion (default: 600)
  --output <format>            Output format: plain or json (default: plain)
  --help                       Show this help message`

const rootUsage = `Usage: cli/arondo-cli <command> [options] <message>

Commands:
  send          Create a session or send a message to an existing session, then wait for the result
  get-messages  Print the full conversation history of a session
  list-agents   List agent availability for all accessible runners
  get-quota     List the recorded quota usage for all accessible runners
  update-quota  Force an asynchronous quota refresh for all accessible runners

Run cli/arondo-cli <command> --help for command options.`

const listAgentsUsage = `List agent availability for all accessible runners.

Usage:
  cli/arondo-cli list-agents \
    --server http://localhost:3251 \
    --token <client_access_token>

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_URL and cli.url in arondo.json)
  --token <token>     Client access token (overrides ARONDO_TOKEN and cli.token in arondo.json)
  --runner-id <id>    Only show one runner
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

const getQuotaUsage = `List the recorded quota usage for all accessible runners.

Usage:
  cli/arondo-cli get-quota \
    --server http://localhost:3251 \
    --token <client_access_token>

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_URL and cli.url in arondo.json)
  --token <token>     Client access token (overrides ARONDO_TOKEN and cli.token in arondo.json)
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

const updateQuotaUsage = `Force an asynchronous quota refresh for all accessible runners.

Usage:
  cli/arondo-cli update-quota \
    --server http://localhost:3251 \
    --token <client_access_token>

The command returns after refresh requests have been queued. Use get-quota to read the updated values.

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_URL and cli.url in arondo.json)
  --token <token>     Client access token (overrides ARONDO_TOKEN and cli.token in arondo.json)
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

const getMessagesUsage = `Print the full conversation history of a session.

Usage:
  cli/arondo-cli get-messages \
    --server http://localhost:3251 \
    --token <client_access_token> \
    --session-id <session_id>

  cli/arondo-cli get-messages \
    --server http://localhost:3251 \
    --token <client_access_token> \
    --latest

Options:
  --server <url>        Arondo server base URL (overrides ARONDO_URL and cli.url in arondo.json)
  --token <token>       Client access token (overrides ARONDO_TOKEN and cli.token in arondo.json)
  --session-id <id>     Session ID to display
  --latest              Use the most recently updated session for the runner and repository path
  --runner-id <id>      Target runner ID (default: connected runner with the current hostname)
  --path <path>         Repository path on the runner (default: current working directory)
  --with-logs           Include agent stdout in a log field for json output (default: false)
  --output <format>     Output format: plain or json (default: plain)
  --help                Show this help message`

type arguments struct {
	server, token, runnerID, repoPath, sessionID, agentType, prompt, output string
	pollInterval, timeout                                                   float64
	tempDir, force, resume                                                  bool
}

type listAgentsArguments struct {
	server, token, runnerID, output string
}

type quotaArguments struct {
	server, token, output string
}

type getMessagesArguments struct {
	server, token, sessionID, runnerID, repoPath, output string
	withLogs, latest                                     bool
}

type apiError struct {
	status int
	body   map[string]any
}

func (e *apiError) Error() string {
	return fmt.Sprintf("request failed (%d): %s", e.status, formatJSON(e.body))
}

type client struct {
	server string
	token  string
	http   *http.Client
}

type cliConfig struct {
	CLI struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	} `json:"cli"`
}

func configDir() (string, error) {
	if configured := os.Getenv("ARONDO_CONFIG_DIR"); configured != "" {
		return filepath.Abs(configured)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".arondo"), nil
}

func loadConfig(filePath string) (cliConfig, error) {
	contents, err := os.ReadFile(filePath)
	if errors.Is(err, os.ErrNotExist) {
		return cliConfig{}, nil
	}
	if err != nil {
		return cliConfig{}, err
	}

	var config cliConfig
	if err := json.Unmarshal(contents, &config); err != nil {
		return cliConfig{}, fmt.Errorf("parse config file %s: %w", filePath, err)
	}
	return config, nil
}

func parseArgs(argv []string, config cliConfig) (arguments, error) {
	args := arguments{server: config.CLI.URL, token: config.CLI.Token, agentType: "auto", pollInterval: 3, timeout: 600, output: "plain"}
	if server := os.Getenv("ARONDO_URL"); server != "" {
		args.server = server
	}
	if token := os.Getenv("ARONDO_TOKEN"); token != "" {
		args.token = token
	}
	valueOptions := map[string]*string{
		"--server": &args.server, "--token": &args.token, "--runner-id": &args.runnerID, "--path": &args.repoPath,
		"--session-id": &args.sessionID, "--agent": &args.agentType, "--output": &args.output,
	}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if !strings.HasPrefix(option, "--") {
			if args.prompt != "" {
				return arguments{}, errors.New("only one message may be provided")
			}
			args.prompt = option
			continue
		}
		switch option {
		case "--help":
			return arguments{}, errHelp
		case "--temp-dir":
			args.tempDir = true
			continue
		case "--force":
			args.force = true
			continue
		case "--resume":
			args.resume = true
			continue
		}

		name, value, inline := strings.Cut(option, "=")
		if name == "--poll-interval" || name == "--timeout" {
			if !inline {
				index++
				if index >= len(argv) {
					return arguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			if value == "" || strings.HasPrefix(value, "--") {
				return arguments{}, fmt.Errorf("option %s requires a value", name)
			}
			parsed, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < 0 {
				return arguments{}, fmt.Errorf("%s must be a non-negative number", name)
			}
			if name == "--poll-interval" {
				args.pollInterval = parsed
			} else {
				args.timeout = parsed
			}
			continue
		}
		destination, ok := valueOptions[name]
		if !ok {
			return arguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return arguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return arguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}

	var missing []string
	if args.server == "" {
		missing = append(missing, "server: specify --server <url>, set ARONDO_URL, or set cli.url in ~/.arondo/arondo.json")
	}
	if args.token == "" {
		missing = append(missing, "token: specify --token <token>, set ARONDO_TOKEN, or set cli.token in ~/.arondo/arondo.json")
	}
	if len(missing) > 0 {
		return arguments{}, fmt.Errorf("missing configuration:\n%s", strings.Join(missing, "\n"))
	}
	if args.prompt == "" {
		return arguments{}, errors.New("a message is required")
	}
	if args.resume && args.sessionID != "" {
		return arguments{}, errors.New("--resume cannot be used with --session-id")
	}
	if args.resume && args.tempDir {
		return arguments{}, errors.New("--resume cannot be used with --temp-dir")
	}
	if args.sessionID == "" && !args.tempDir && args.repoPath == "" {
		workingDirectory, err := os.Getwd()
		if err != nil {
			return arguments{}, err
		}
		args.repoPath = workingDirectory
	}
	if !map[string]bool{"auto": true, "antigravity": true, "claude": true, "codex": true, "opencode": true}[args.agentType] {
		return arguments{}, errors.New("--agent must be auto, antigravity, claude, codex, or opencode")
	}
	if args.output != "plain" && args.output != "json" {
		return arguments{}, errors.New("--output must be plain or json")
	}
	return args, nil
}

var errHelp = errors.New("help requested")

func configuredServerAndToken(config cliConfig) (string, string) {
	server, token := config.CLI.URL, config.CLI.Token
	if value := os.Getenv("ARONDO_URL"); value != "" {
		server = value
	}
	if value := os.Getenv("ARONDO_TOKEN"); value != "" {
		token = value
	}
	return server, token
}

func validateServerAndToken(server, token string) error {
	var missing []string
	if server == "" {
		missing = append(missing, "server: specify --server <url>, set ARONDO_URL, or set cli.url in ~/.arondo/arondo.json")
	}
	if token == "" {
		missing = append(missing, "token: specify --token <token>, set ARONDO_TOKEN, or set cli.token in ~/.arondo/arondo.json")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing configuration:\n%s", strings.Join(missing, "\n"))
	}
	return nil
}

func parseListAgentsArgs(argv []string, config cliConfig) (listAgentsArguments, error) {
	server, token := configuredServerAndToken(config)
	args := listAgentsArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{"--server": &args.server, "--token": &args.token, "--runner-id": &args.runnerID, "--output": &args.output}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" {
			return listAgentsArguments{}, errHelp
		}
		if !strings.HasPrefix(option, "--") {
			return listAgentsArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		destination, ok := valueOptions[name]
		if !ok {
			return listAgentsArguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return listAgentsArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return listAgentsArguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}
	if args.output != "plain" && args.output != "json" {
		return listAgentsArguments{}, errors.New("--output must be plain or json")
	}
	return args, validateServerAndToken(args.server, args.token)
}

func parseQuotaArgs(argv []string, config cliConfig) (quotaArguments, error) {
	server, token := configuredServerAndToken(config)
	args := quotaArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{"--server": &args.server, "--token": &args.token, "--output": &args.output}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" {
			return quotaArguments{}, errHelp
		}
		if !strings.HasPrefix(option, "--") {
			return quotaArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		destination, ok := valueOptions[name]
		if !ok {
			return quotaArguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return quotaArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return quotaArguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}
	if args.output != "plain" && args.output != "json" {
		return quotaArguments{}, errors.New("--output must be plain or json")
	}
	return args, validateServerAndToken(args.server, args.token)
}

func parseGetMessagesArgs(argv []string, config cliConfig) (getMessagesArguments, error) {
	server, token := configuredServerAndToken(config)
	args := getMessagesArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{
		"--server": &args.server, "--token": &args.token, "--session-id": &args.sessionID,
		"--runner-id": &args.runnerID, "--path": &args.repoPath, "--output": &args.output,
	}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" {
			return getMessagesArguments{}, errHelp
		}
		if option == "--with-logs" {
			args.withLogs = true
			continue
		}
		if option == "--latest" {
			args.latest = true
			continue
		}
		if !strings.HasPrefix(option, "--") {
			return getMessagesArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		destination, ok := valueOptions[name]
		if !ok {
			return getMessagesArguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return getMessagesArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return getMessagesArguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}
	if args.sessionID == "" && !args.latest {
		return getMessagesArguments{}, errors.New("either --session-id or --latest is required")
	}
	if args.sessionID != "" && args.latest {
		return getMessagesArguments{}, errors.New("--session-id and --latest cannot be used together")
	}
	if args.output != "plain" && args.output != "json" {
		return getMessagesArguments{}, errors.New("--output must be plain or json")
	}
	return args, validateServerAndToken(args.server, args.token)
}

func (c *client) request(method, path string, payload any, result any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = strings.NewReader(string(encoded))
	}
	request, err := http.NewRequest(method, strings.TrimRight(c.server, "/")+path, body)
	if err != nil {
		return err
	}
	request.Header.Set("x-arondo-token", c.token)
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	contents, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		apiBody := map[string]any{"error": string(contents)}
		_ = json.Unmarshal(contents, &apiBody)
		return &apiError{status: response.StatusCode, body: apiBody}
	}
	return json.Unmarshal(contents, result)
}

func (c *client) listRunners() ([]runner, error) {
	var runners []runner
	return runners, c.request(http.MethodGet, "/api/runners", nil, &runners)
}

func (c *client) listSessions() ([]session, error) {
	var sessions []session
	return sessions, c.request(http.MethodGet, "/api/sessions", nil, &sessions)
}

func (c *client) getAgentInfo(runnerID string) (map[string]map[string]any, error) {
	info := map[string]map[string]any{}
	return info, c.request(http.MethodGet, "/api/agents/info?runnerId="+url.QueryEscape(runnerID), nil, &info)
}

func (c *client) updateQuota() (map[string]any, error) {
	result := map[string]any{}
	return result, c.request(http.MethodPost, "/api/agents/quota", map[string]any{}, &result)
}

func (c *client) getSession(sessionID string) (session, error) {
	var session session
	return session, c.request(http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID), nil, &session)
}

func (c *client) createSession(args arguments) (session, error) {
	payload := map[string]any{"prompt": args.prompt, "agentType": args.agentType}
	if args.tempDir {
		payload["tempDir"] = true
	} else {
		payload["repoPath"] = args.repoPath
	}
	if args.runnerID != "" {
		payload["runnerId"] = args.runnerID
	}
	if args.force {
		payload["force"] = true
	}
	var session session
	return session, c.request(http.MethodPost, "/api/sessions", payload, &session)
}

func (c *client) sendMessage(sessionID string, args arguments) error {
	payload := map[string]any{"message": args.prompt}
	if args.force {
		payload["force"] = true
	}
	return c.request(http.MethodPost, "/api/sessions/"+url.PathEscape(sessionID)+"/messages", payload, &map[string]any{})
}

func (c *client) rawOutput(sessionID string) (string, error) {
	var messages []message
	if err := c.request(http.MethodGet, "/api/messages?sessionId="+url.QueryEscape(sessionID), nil, &messages); err != nil {
		return "", err
	}
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Type != "agent-run" {
			continue
		}
		var result struct {
			Log string `json:"log"`
		}
		err := c.request(http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID)+"/log?messageId="+url.QueryEscape(messages[index].ID), nil, &result)
		return result.Log, err
	}
	return "", nil
}

func (c *client) listMessages(sessionID string) ([]message, error) {
	var messages []message
	return messages, c.request(http.MethodGet, "/api/messages?sessionId="+url.QueryEscape(sessionID), nil, &messages)
}

func (c *client) getSessionLog(sessionID, messageID string) (string, error) {
	var result struct {
		Log string `json:"log"`
	}
	err := c.request(http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID)+"/log?messageId="+url.QueryEscape(messageID), nil, &result)
	return result.Log, err
}

func (c *client) conversationMessages(sessionID string, messages []message) ([]message, error) {
	filtered := messages[:0]
	for _, msg := range messages {
		switch msg.Type {
		case "script-run", "script-return", "agent-return":
			continue
		case "agent-run":
			log, err := c.getSessionLog(sessionID, msg.ID)
			if err != nil {
				return nil, err
			}
			msg.Content = log
		}
		filtered = append(filtered, msg)
	}
	return filtered, nil
}

func agentLabel(command string) string {
	label := "Agent"
	if fields := strings.Fields(command); len(fields) > 0 {
		label += ": " + fields[0]
	}
	return label
}

type runner struct {
	ID        string   `json:"id"`
	Hostname  string   `json:"hostname"`
	Connected bool     `json:"connected"`
	Agents    []string `json:"agents"`
}
type message struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionId"`
	Role      string `json:"role"`
	Type      string `json:"type"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	ExitCode  *int   `json:"exitCode"`
	Command   string `json:"command"`
	UserName  string `json:"userName"`
}
type session struct {
	ID, RunnerID, RepoPath, Status, ErrorMessage string
	UpdatedAt                                    time.Time
	Raw                                          map[string]any
}

func (s *session) UnmarshalJSON(data []byte) error {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	s.Raw = raw
	s.ID, _ = raw["id"].(string)
	s.RunnerID, _ = raw["runnerId"].(string)
	s.RepoPath, _ = raw["repoPath"].(string)
	s.Status, _ = raw["status"].(string)
	s.ErrorMessage, _ = raw["errorMessage"].(string)
	if updatedAt, ok := raw["updatedAt"].(string); ok {
		s.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	}
	return nil
}

func resolveRunnerID(c *client, hostname string) (string, error) {
	runners, err := c.listRunners()
	if err != nil {
		return "", err
	}
	var matches []runner
	for _, runner := range runners {
		if runner.Connected && runner.Hostname == hostname {
			matches = append(matches, runner)
		}
	}
	if len(matches) == 1 {
		return matches[0].ID, nil
	}
	if len(matches) == 0 {
		return "", fmt.Errorf("no connected runner matches hostname %q; specify --runner-id <id>", hostname)
	}
	return "", fmt.Errorf("multiple connected runners match hostname %q; specify --runner-id <id>", hostname)
}

func resolveRecentSessionID(c *client, runnerID, repoPath string) (string, error) {
	sessions, err := c.listSessions()
	if err != nil {
		return "", err
	}
	var selected *session
	for index := range sessions {
		candidate := &sessions[index]
		if candidate.RunnerID == runnerID && candidate.RepoPath == repoPath && (selected == nil || candidate.UpdatedAt.After(selected.UpdatedAt)) {
			selected = candidate
		}
	}
	if selected == nil {
		return "", fmt.Errorf("no session found for runner %q and repository path %q", runnerID, repoPath)
	}
	return selected.ID, nil
}

func pollUntilDone(c *client, sessionID string, interval, timeout time.Duration) (session, error) {
	deadline := time.Now().Add(timeout)
	for {
		session, err := c.getSession(sessionID)
		if err != nil {
			return session, err
		}
		fmt.Fprintf(os.Stderr, "[poll] status=%s\n", session.Status)
		if session.Status == "done" || session.Status == "error" {
			return session, nil
		}
		if !time.Now().Before(deadline) {
			return session, fmt.Errorf("session %s did not finish within %s", sessionID, timeout)
		}
		time.Sleep(interval)
	}
}

func formatJSON(value any) string { encoded, _ := json.Marshal(value); return string(encoded) }

func humanReadableQuotaValue(key string, value any) any {
	if !strings.HasSuffix(key, "At") || value == nil {
		return value
	}
	var t time.Time
	switch v := value.(type) {
	case float64:
		t = timeFromQuotaTimestamp(int64(v))
	case int64:
		t = timeFromQuotaTimestamp(v)
	case int:
		t = timeFromQuotaTimestamp(int64(v))
	case json.Number:
		parsed, err := v.Int64()
		if err != nil {
			return value
		}
		t = timeFromQuotaTimestamp(parsed)
	case string:
		parsed, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return value
		}
		t = parsed
	default:
		return value
	}
	return t.Local().Format("2006-01-02 15:04:05 MST")
}

func timeFromQuotaTimestamp(value int64) time.Time {
	if absInt64(value) >= 1e12 {
		return time.UnixMilli(value)
	}
	return time.Unix(value, 0)
}

func absInt64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}

func humanReadableQuotaTimes(quota map[string]any) map[string]any {
	formatted := make(map[string]any, len(quota))
	for key, value := range quota {
		if nested, ok := value.(map[string]any); ok {
			formatted[key] = humanReadableQuotaTimes(nested)
			continue
		}
		formatted[key] = humanReadableQuotaValue(key, value)
	}
	return formatted
}

type agentStatus struct {
	Type      string         `json:"type"`
	Binary    string         `json:"binary"`
	Available bool           `json:"available"`
	Reason    string         `json:"reason,omitempty"`
	Quota     map[string]any `json:"quota,omitempty"`
}

type runnerAgentStatus struct {
	RunnerID  string        `json:"runnerId"`
	Hostname  string        `json:"hostname"`
	Connected bool          `json:"connected"`
	Agents    []agentStatus `json:"agents"`
}

var knownAgents = []struct {
	agentType string
	binary    string
}{
	{"antigravity", "agy"},
	{"claude", "claude"},
	{"codex", "codex"},
	{"opencode", "opencode"},
}

func analyzeAgentStatus(runner runner, agentType, binary string, quota map[string]any) agentStatus {
	status := agentStatus{Type: agentType, Binary: binary, Available: true, Quota: quota}
	if !runner.Connected {
		status.Available = false
		status.Reason = "runner disconnected"
		return status
	}
	if !containsString(runner.Agents, binary) {
		status.Available = false
		status.Reason = fmt.Sprintf("binary %q not found on runner PATH", binary)
		return status
	}
	if reason := quotaUnavailableReason(agentType, quota); reason != "" {
		status.Available = false
		status.Reason = reason
	}
	return status
}

func quotaUnavailableReason(agentType string, quota map[string]any) string {
	if quota == nil {
		return ""
	}
	switch agentType {
	case "claude":
		return quotaBelowThreshold(quota, "HourRemain", "hourly quota below 15%")
	case "antigravity":
		geminiLow := quotaNumberBelow(quota, "GeminiHourRemain", 0.15)
		otherLow := quotaNumberBelow(quota, "OtherHourRemain", 0.15)
		if geminiLow && otherLow {
			return "all hourly quotas below 15%"
		}
	case "codex":
		if quotaNumberBelow(quota, "WeeklyRemain", 0.000001) {
			return "weekly quota exhausted"
		}
	}
	return ""
}

func quotaBelowThreshold(quota map[string]any, key, reason string) string {
	if quotaNumberBelow(quota, key, 0.15) {
		return reason
	}
	return ""
}

func quotaNumberBelow(quota map[string]any, key string, threshold float64) bool {
	value, ok := quota[key]
	if !ok || value == nil {
		return false
	}
	number, ok := value.(float64)
	return ok && number < threshold
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func listAgents(c *client, args listAgentsArguments) error {
	runners, err := c.listRunners()
	if err != nil {
		return err
	}
	var reports []runnerAgentStatus
	for _, runner := range runners {
		if args.runnerID != "" && runner.ID != args.runnerID {
			continue
		}
		agentInfo := map[string]map[string]any{}
		if runner.Connected {
			agentInfo, err = c.getAgentInfo(runner.ID)
			if err != nil {
				return err
			}
		}
		report := runnerAgentStatus{RunnerID: runner.ID, Hostname: runner.Hostname, Connected: runner.Connected}
		for _, known := range knownAgents {
			report.Agents = append(report.Agents, analyzeAgentStatus(runner, known.agentType, known.binary, agentInfo[known.agentType]))
		}
		reports = append(reports, report)
	}
	if args.runnerID != "" && len(reports) == 0 {
		return fmt.Errorf("runner %q not found or not accessible", args.runnerID)
	}
	if args.output == "json" {
		pretty, _ := json.MarshalIndent(reports, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}
	for _, report := range reports {
		connectedStr := "disconnected"
		if report.Connected {
			connectedStr = "connected"
		}
		fmt.Printf("runner: %s (%s) [%s]\n", report.Hostname, report.RunnerID, connectedStr)
		for _, agent := range report.Agents {
			status := "available"
			if !agent.Available {
				status = "unavailable"
				if agent.Reason != "" {
					status += ": " + agent.Reason
				}
			}
			fmt.Printf("  %-14s %s\n", agent.Type, status)
		}
	}
	return nil
}

func getQuota(c *client, args quotaArguments) error {
	runners, err := c.listRunners()
	if err != nil {
		return err
	}
	type quotaReport struct {
		RunnerID  string                    `json:"runnerId"`
		Hostname  string                    `json:"hostname"`
		Connected bool                      `json:"connected"`
		Quotas    map[string]map[string]any `json:"quotas"`
	}
	reports := make([]quotaReport, 0, len(runners))
	for _, runner := range runners {
		quotas, err := c.getAgentInfo(runner.ID)
		if err != nil {
			return err
		}
		for agentType, quota := range quotas {
			quotas[agentType] = humanReadableQuotaTimes(quota)
		}
		reports = append(reports, quotaReport{RunnerID: runner.ID, Hostname: runner.Hostname, Connected: runner.Connected, Quotas: quotas})
	}
	if args.output == "json" {
		pretty, _ := json.MarshalIndent(reports, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}
	for _, report := range reports {
		connectedStr := "disconnected"
		if report.Connected {
			connectedStr = "connected"
		}
		fmt.Printf("runner: %s (%s) [%s]\n", report.Hostname, report.RunnerID, connectedStr)
		if len(report.Quotas) == 0 {
			fmt.Println("  no quota data")
			continue
		}
		for agentType, quota := range report.Quotas {
			fmt.Printf("  %s:\n", agentType)
			for key, val := range quota {
				fmt.Printf("    %s: %v\n", key, val)
			}
		}
	}
	return nil
}

func updateQuota(c *client, args quotaArguments) error {
	result, err := c.updateQuota()
	if err != nil {
		return err
	}
	if args.output == "json" {
		pretty, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}
	queued, _ := result["queued"].(float64)
	fmt.Printf("Quota refresh queued for %d runner(s).\n", int(queued))
	return nil
}

func getMessages(c *client, args getMessagesArguments) error {
	if args.latest {
		if args.runnerID == "" {
			hostname, err := os.Hostname()
			if err != nil {
				return err
			}
			args.runnerID, err = resolveRunnerID(c, hostname)
			if err != nil {
				return err
			}
		}
		if args.repoPath == "" {
			wd, err := os.Getwd()
			if err != nil {
				return err
			}
			args.repoPath = wd
		}
		sessionID, err := resolveRecentSessionID(c, args.runnerID, args.repoPath)
		if err != nil {
			return err
		}
		args.sessionID = sessionID
		fmt.Fprintf(os.Stderr, "Using most recent session %s...\n", args.sessionID)
	}

	sess, err := c.getSession(args.sessionID)
	if err != nil {
		return err
	}

	messages, err := c.listMessages(args.sessionID)
	if err != nil {
		return err
	}

	messages, err = c.conversationMessages(args.sessionID, messages)
	if err != nil {
		return err
	}

	if args.output == "json" {
		if !args.withLogs {
			pretty, _ := json.MarshalIndent(messages, "", "  ")
			fmt.Println(string(pretty))
			return nil
		}
		type messageWithLog struct {
			message
			Log string `json:"log,omitempty"`
		}
		enriched := make([]messageWithLog, 0, len(messages))
		for _, msg := range messages {
			entry := messageWithLog{message: msg}
			if msg.Type == "agent-run" {
				entry.Log = msg.Content
			}
			enriched = append(enriched, entry)
		}
		pretty, _ := json.MarshalIndent(enriched, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}

	isSessionRunning := sess.Status == "running"

	separator := strings.Repeat("─", 60)
	for _, msg := range messages {
		ts := msg.CreatedAt
		if t, err := time.Parse(time.RFC3339, msg.CreatedAt); err == nil {
			ts = t.Local().Format("2006-01-02 15:04:05")
		}

		switch msg.Role {
		case "user":
			sender := "User"
			if msg.UserName != "" {
				sender = msg.UserName
			}
			fmt.Printf("\n%s\n[%s] %s\n%s\n", separator, ts, sender, separator)
			fmt.Println(msg.Content)
		case "agent":
			fmt.Printf("\n%s\n[%s] Agent\n%s\n", separator, ts, separator)
			fmt.Println(msg.Content)
		case "system":
			label := "System"
			if msg.Type == "agent-run" {
				label = agentLabel(msg.Command)
				if msg.ExitCode != nil {
					label += fmt.Sprintf(" (exit %d)", *msg.ExitCode)
				} else if isSessionRunning {
					label += " (Running)"
				}
			}
			fmt.Printf("\n%s\n[%s] %s\n%s\n", separator, ts, label, separator)
			if msg.Content != "" {
				if msg.Type == "agent-run" {
					fmt.Print(msg.Content)
					if !strings.HasSuffix(msg.Content, "\n") {
						fmt.Println()
					}
				} else {
					fmt.Println(msg.Content)
				}
			}
		}
	}
	return nil
}

func run(argv []string) error {
	if len(argv) == 1 && (argv[0] == "--help" || argv[0] == "-h") {
		fmt.Fprintln(os.Stderr, rootUsage)
		return nil
	}
	if len(argv) == 0 {
		return fmt.Errorf("a command is required\n\n%s", rootUsage)
	}
	if argv[0] != "send" && argv[0] != "get-messages" && argv[0] != "list-agents" && argv[0] != "get-quota" && argv[0] != "update-quota" {
		return fmt.Errorf("unknown command: %s\n\n%s", argv[0], rootUsage)
	}
	configDir, err := configDir()
	if err != nil {
		return err
	}
	config, err := loadConfig(filepath.Join(configDir, "arondo.json"))
	if err != nil {
		return err
	}
	if argv[0] == "get-messages" {
		args, err := parseGetMessagesArgs(argv[1:], config)
		if errors.Is(err, errHelp) {
			fmt.Fprintln(os.Stderr, getMessagesUsage)
			return nil
		}
		if err != nil {
			return err
		}
		return getMessages(&client{server: args.server, token: args.token, http: http.DefaultClient}, args)
	}
	if argv[0] == "list-agents" {
		args, err := parseListAgentsArgs(argv[1:], config)
		if errors.Is(err, errHelp) {
			fmt.Fprintln(os.Stderr, listAgentsUsage)
			return nil
		}
		if err != nil {
			return err
		}
		return listAgents(&client{server: args.server, token: args.token, http: http.DefaultClient}, args)
	}
	if argv[0] == "get-quota" || argv[0] == "update-quota" {
		args, err := parseQuotaArgs(argv[1:], config)
		if errors.Is(err, errHelp) {
			if argv[0] == "get-quota" {
				fmt.Fprintln(os.Stderr, getQuotaUsage)
			} else {
				fmt.Fprintln(os.Stderr, updateQuotaUsage)
			}
			return nil
		}
		if err != nil {
			return err
		}
		c := &client{server: args.server, token: args.token, http: http.DefaultClient}
		if argv[0] == "get-quota" {
			return getQuota(c, args)
		}
		return updateQuota(c, args)
	}

	args, err := parseArgs(argv[1:], config)
	if errors.Is(err, errHelp) {
		fmt.Fprintln(os.Stderr, usage)
		return nil
	}
	if err != nil {
		return err
	}
	c := &client{server: args.server, token: args.token, http: http.DefaultClient}
	if args.resume {
		if args.runnerID == "" {
			hostname, err := os.Hostname()
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "Resolving runner for hostname %s...\n", hostname)
			args.runnerID, err = resolveRunnerID(c, hostname)
			if err != nil {
				return err
			}
		}
		args.sessionID, err = resolveRecentSessionID(c, args.runnerID, args.repoPath)
		if err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "Resuming most recent session %s...\n", args.sessionID)
	}
	sessionID := args.sessionID
	if sessionID != "" {
		fmt.Fprintf(os.Stderr, "Sending message to session %s...\n", sessionID)
		if err := c.sendMessage(sessionID, args); err != nil {
			return err
		}
	} else {
		if args.runnerID == "" && !args.tempDir {
			hostname, err := os.Hostname()
			if err != nil {
				return err
			}
			fmt.Fprintf(os.Stderr, "Resolving runner for hostname %s...\n", hostname)
			args.runnerID, err = resolveRunnerID(c, hostname)
			if err != nil {
				return err
			}
		}
		fmt.Fprintln(os.Stderr, "Creating session...")
		created, err := c.createSession(args)
		if err != nil {
			return err
		}
		sessionID = created.ID
		fmt.Fprintf(os.Stderr, "Created session %s (repoPath=%s, runnerId=%s)\n", sessionID, created.RepoPath, created.RunnerID)
	}
	fmt.Fprintf(os.Stderr, "Session ID: %s\nWaiting for the run to finish...\n", sessionID)
	session, err := pollUntilDone(c, sessionID, time.Duration(args.pollInterval*float64(time.Second)), time.Duration(args.timeout*float64(time.Second)))
	if err != nil {
		return err
	}
	rawOutput, err := c.rawOutput(sessionID)
	if err != nil {
		return err
	}
	if args.output == "json" {
		result := session.Raw
		delete(result, "id")
		result["sessionId"] = sessionID
		result["rawOutput"] = rawOutput
		fmt.Fprintln(os.Stderr, "\n=== Result ===")
		pretty, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(pretty))
	} else {
		fmt.Print(rawOutput)
	}
	if session.Status == "error" {
		fmt.Fprintf(os.Stderr, "\nSession finished with an error: %s\n", session.ErrorMessage)
		return errSession
	}
	fmt.Fprintln(os.Stderr, "\nSession finished successfully.")
	return nil
}

var errSession = errors.New("session failed")

func main() {
	err := run(os.Args[1:])
	if err == nil {
		return
	}
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.body["needsConfirmation"] == true {
		apiErr.body["hint"] = "Retry this command with --force to bypass the confirmation."
		pretty, _ := json.MarshalIndent(apiErr.body, "", "  ")
		fmt.Fprintln(os.Stderr, string(pretty))
	} else if !errors.Is(err, errSession) {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(1)
}
