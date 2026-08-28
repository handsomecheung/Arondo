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

const usage = `Create a session, send a message, stream the result in real-time, and print the final status.

Usage:
  cli/arondo-cli send \
    --server http://localhost:3251 \
    --client-token <client_access_token> \
    --temp-dir \
    "Print the current date"

  cli/arondo-cli send \
    --server http://localhost:3251 \
    --client-token <client_access_token> \
    --resume \
    "Now also print the current directory"

Options:
  --server <url>               Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token>       Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --runner-id <id>             Target runner ID (default: connected runner with the current hostname)
  --path <path>                Repository path on the runner (default: current working directory)
  --temp-dir                   Create the session in a fresh temporary directory on the runner
  --session-id <id>            Send the message to an existing session
  --resume                     Resume the most recently updated session for the runner and repository path
  --confirmation <value>       Resolve a needs-confirmation response: auto, draft, or force
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

type arguments struct {
	server, token, runnerID, repoPath, sessionID, agentType, prompt, output, confirmation string
	pollInterval, timeout                                                                 float64
	tempDir, resume                                                                       bool
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
		Server      string `json:"server"`
		ClientToken string `json:"clientToken"`
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
	args := arguments{server: config.CLI.Server, token: config.CLI.ClientToken, agentType: "auto", pollInterval: 3, timeout: 600, output: "plain"}
	if server := os.Getenv("ARONDO_SERVER"); server != "" {
		args.server = server
	}
	if token := os.Getenv("ARONDO_CLIENT_TOKEN"); token != "" {
		args.token = token
	}
	valueOptions := map[string]*string{
		"--server": &args.server, "--client-token": &args.token, "--runner-id": &args.runnerID, "--path": &args.repoPath,
		"--session-id": &args.sessionID, "--agent": &args.agentType, "--output": &args.output,
		"--confirmation": &args.confirmation,
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
			return arguments{}, errors.New("--force has been replaced by --confirmation force")
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
		missing = append(missing, "server: specify --server <url>, set ARONDO_SERVER, or set cli.server in ~/.arondo/arondo.json")
	}
	if args.token == "" {
		missing = append(missing, "client token: specify --client-token <token>, set ARONDO_CLIENT_TOKEN, or set cli.clientToken in ~/.arondo/arondo.json")
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
	if args.confirmation != "" && !map[string]bool{"auto": true, "draft": true, "force": true}[args.confirmation] {
		return arguments{}, errors.New("--confirmation must be auto, draft, or force")
	}
	return args, nil
}

var errHelp = errors.New("help requested")

func configuredServerAndToken(config cliConfig) (string, string) {
	server, token := config.CLI.Server, config.CLI.ClientToken
	if value := os.Getenv("ARONDO_SERVER"); value != "" {
		server = value
	}
	if value := os.Getenv("ARONDO_CLIENT_TOKEN"); value != "" {
		token = value
	}
	return server, token
}

func validateServerAndToken(server, token string) error {
	var missing []string
	if server == "" {
		missing = append(missing, "server: specify --server <url>, set ARONDO_SERVER, or set cli.server in ~/.arondo/arondo.json")
	}
	if token == "" {
		missing = append(missing, "client token: specify --client-token <token>, set ARONDO_CLIENT_TOKEN, or set cli.clientToken in ~/.arondo/arondo.json")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing configuration:\n%s", strings.Join(missing, "\n"))
	}
	return nil
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

func (c *client) getSession(sessionID string) (session, error) {
	var session session
	return session, c.request(http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID), nil, &session)
}

func (c *client) createSession(args arguments, force bool) (session, error) {
	payload := map[string]any{"prompt": args.prompt, "agentType": args.agentType}
	if args.tempDir {
		payload["tempDir"] = true
	} else {
		payload["repoPath"] = args.repoPath
	}
	if args.runnerID != "" {
		payload["runnerId"] = args.runnerID
	}
	if force {
		payload["force"] = true
	}
	var session session
	return session, c.request(http.MethodPost, "/api/sessions", payload, &session)
}

type sendMessageResult struct {
	MessageID string `json:"messageId"`
}

func (c *client) sendMessage(sessionID string, args arguments, force bool) (sendMessageResult, error) {
	payload := map[string]any{"message": args.prompt}
	if force {
		payload["force"] = true
	}
	var result sendMessageResult
	return result, c.request(http.MethodPost, "/api/sessions/"+url.PathEscape(sessionID)+"/messages", payload, &result)
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

type runner struct {
	ID        string   `json:"id"`
	Hostname  string   `json:"hostname"`
	Connected bool     `json:"connected"`
	Agents    []string `json:"agents"`
}

type message struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionId"`
	ParentID  string `json:"parentId"`
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

func pollDetachedAgentUntilDone(c *client, sessionID, runMessageID string, interval, timeout time.Duration) (message, message, error) {
	deadline := time.Now().Add(timeout)
	for {
		messages, err := c.listMessages(sessionID)
		if err != nil {
			return message{}, message{}, err
		}

		var run message
		for _, candidate := range messages {
			if candidate.ID == runMessageID && candidate.Type == "detached-agent-run" {
				run = candidate
				break
			}
		}
		for _, candidate := range messages {
			if candidate.Type == "detached-agent-return" && candidate.ParentID == runMessageID {
				return run, candidate, nil
			}
		}

		if !time.Now().Before(deadline) {
			return message{}, message{}, fmt.Errorf("detached agent run %s did not finish within %s", runMessageID, timeout)
		}
		time.Sleep(interval)
	}
}

func formatJSON(value any) string { encoded, _ := json.Marshal(value); return string(encoded) }

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
	ws, _ := dialWebSocket(args.server, args.token, 5*time.Second)
	if ws != nil {
		defer ws.Close()
	}

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
	queued := false
	queuedTrigger := ""
	messageID := ""
	if sessionID != "" {
		fmt.Fprintf(os.Stderr, "Sending message to session %s...\n", sessionID)
		sent, err := c.sendMessage(sessionID, args, false)
		if err != nil {
			queued, queuedTrigger, err = c.resolveMessageConfirmation(sessionID, args, err)
			if err != nil {
				return err
			}
		} else {
			messageID = sent.MessageID
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
		created, err := c.createSession(args, false)
		if err != nil {
			created, queued, queuedTrigger, err = c.resolveCreateConfirmation(args, err)
			if err != nil {
				return err
			}
		}
		sessionID = created.ID
		fmt.Fprintf(os.Stderr, "Created session %s (repoPath=%s, runnerId=%s)\n", sessionID, created.RepoPath, created.RunnerID)
	}
	if queued {
		return outputQueuedResult(c, sessionID, args, queuedTrigger)
	}

	interval := time.Duration(args.pollInterval * float64(time.Second))
	timeout := time.Duration(args.timeout * float64(time.Second))
	if messageID != "" {
		fmt.Fprintf(os.Stderr, "Session ID: %s\nWaiting for detached agent run to finish...\n", sessionID)
	} else {
		fmt.Fprintf(os.Stderr, "Session ID: %s\nWaiting for the run to finish...\n", sessionID)
	}

	session, rawOutput, agentCommand, detachedFailed, err := streamSessionUntilDone(c, args, sessionID, messageID, ws, interval, timeout)
	if err != nil {
		return err
	}

	if args.output == "json" {
		result := session.Raw
		if result == nil {
			result = map[string]any{}
		}
		delete(result, "id")
		result["sessionId"] = sessionID
		result["rawOutput"] = rawOutput
		if agentCommand != "" {
			result["command"] = agentCommand
		}
		fmt.Fprintln(os.Stderr, "\n=== Result ===")
		pretty, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(pretty))
	}
	if detachedFailed {
		fmt.Fprintln(os.Stderr, "\nDetached agent finished with an error.")
		return errSession
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
		apiErr.body["hint"] = "Retry this command with --confirmation auto, --confirmation draft, or --confirmation force."
		pretty, _ := json.MarshalIndent(apiErr.body, "", "  ")
		fmt.Fprintln(os.Stderr, string(pretty))
	} else if !errors.Is(err, errSession) {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(1)
}
