package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"
)

const getMessagesUsage = `Print the full conversation history of a session.

Usage:
  cli/arondo-cli get-messages \
    --server http://localhost:3251 \
    --client-token <client_access_token> \
    --session-id <session_id>

  cli/arondo-cli get-messages \
    --server http://localhost:3251 \
    --client-token <client_access_token> \
    --latest

  cli/arondo-cli get-messages \
    --server http://localhost:3251 \
    --client-token <client_access_token> \
    --session-id <session_id> \
    --follow

Options:
  --server <url>               Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token>       Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --session-id <id>            Session ID to display
  --latest                     Use the most recently updated session for the runner and repository path
  --runner-id <id>             Target runner ID (default: connected runner with the current hostname)
  --path <path>                Repository path on the runner (default: current working directory)
  --follow, -f                 Stream output of a running agent until it completes (default: false)
  --poll-interval <seconds>    Seconds between status polls when following (default: 3)
  --timeout <seconds>          Maximum seconds to wait when following (default: 600)
  --with-logs                  Include agent stdout in a log field for json output (default: false)
  --output <format>            Output format: plain or json (default: plain)
  --help                       Show this help message`

type getMessagesArguments struct {
	server, token, sessionID, runnerID, repoPath, output string
	pollInterval, timeout                                float64
	withLogs, latest, follow                             bool
}

func parseGetMessagesArgs(argv []string, config cliConfig) (getMessagesArguments, error) {
	server, token := configuredServerAndToken(config)
	args := getMessagesArguments{server: server, token: token, output: "plain", pollInterval: 3, timeout: 600}
	valueOptions := map[string]*string{
		"--server": &args.server, "--client-token": &args.token, "--session-id": &args.sessionID,
		"--runner-id": &args.runnerID, "--path": &args.repoPath, "--output": &args.output,
	}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" || option == "-h" {
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
		if option == "--follow" || option == "-f" {
			args.follow = true
			continue
		}
		if !strings.HasPrefix(option, "--") {
			return getMessagesArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		if name == "--poll-interval" || name == "--timeout" {
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
			parsed, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < 0 {
				return getMessagesArguments{}, fmt.Errorf("%s must be a non-negative number", name)
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

func agentLabel(command string) string {
	label := "Agent"
	if fields := strings.Fields(command); len(fields) > 0 {
		label += ": " + fields[0]
	}
	return label
}

func (c *client) conversationMessages(sessionID string, messages []message) ([]message, error) {
	filtered := messages[:0]
	for _, msg := range messages {
		switch msg.Type {
		case "script-run", "script-return", "agent-return", "detached-agent-run", "detached-agent-return", "user-todo":
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

func outputJSONMessages(messages []message, withLogs bool) error {
	if !withLogs {
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

func printPlainMessage(msg message, isSessionRunning bool) {
	separator := strings.Repeat("─", 60)
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

func followRunningAgent(c *client, args getMessagesArguments, sess session, initialMessages []message, ws *wsClient) error {
	var eventsChan <-chan wsEvent
	if ws != nil {
		eventsChan = ws.eventsChan
	}

	interval := time.Duration(args.pollInterval * float64(time.Second))
	timeout := time.Duration(args.timeout * float64(time.Second))

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	var activeMsg *message
	var priorMessages []message

	for i := 0; i < len(initialMessages); i++ {
		msg := initialMessages[i]
		switch msg.Type {
		case "script-run", "script-return", "agent-return", "detached-agent-run", "detached-agent-return", "user-todo":
			continue
		case "agent-run":
			if msg.ExitCode == nil && i == len(initialMessages)-1 {
				activeMsg = &initialMessages[i]
				continue
			}
			log, err := c.getSessionLog(args.sessionID, msg.ID)
			if err == nil {
				msg.Content = log
			}
		}
		priorMessages = append(priorMessages, msg)
	}

	var printedLen int
	var activeMsgID string
	if args.output != "json" {
		for _, msg := range priorMessages {
			printPlainMessage(msg, false)
		}

		if activeMsg != nil {
			activeMsgID = activeMsg.ID
			separator := strings.Repeat("─", 60)
			ts := activeMsg.CreatedAt
			if t, err := time.Parse(time.RFC3339, activeMsg.CreatedAt); err == nil {
				ts = t.Local().Format("2006-01-02 15:04:05")
			}
			label := agentLabel(activeMsg.Command) + " (Running)"
			fmt.Printf("\n%s\n[%s] %s\n%s\n", separator, ts, label, separator)

			initialLog, _ := c.getSessionLog(args.sessionID, activeMsg.ID)
			if initialLog != "" {
				fmt.Print(initialLog)
				printedLen = len(initialLog)
			}
		}
	} else if activeMsg != nil {
		activeMsgID = activeMsg.ID
	}

	done := false
	for !done {
		select {
		case ev, ok := <-eventsChan:
			if !ok {
				eventsChan = nil
				continue
			}
			switch ev.Type {
			case "terminal:output":
				if ev.SessionID == args.sessionID && (activeMsgID == "" || ev.MessageID == activeMsgID) {
					if args.output != "json" {
						fmt.Print(ev.Data)
						printedLen += len(ev.Data)
					}
				}
			case "session:updated":
				var s session
				if err := json.Unmarshal(ev.Payload, &s); err == nil && s.ID == args.sessionID {
					if s.Status == "done" || s.Status == "error" {
						done = true
					}
				}
			case "message:added":
				var m message
				if err := json.Unmarshal(ev.Payload, &m); err == nil && m.Type == "agent-run" {
					if activeMsgID == "" {
						activeMsgID = m.ID
						if args.output != "json" {
							separator := strings.Repeat("─", 60)
							ts := m.CreatedAt
							if t, err := time.Parse(time.RFC3339, m.CreatedAt); err == nil {
								ts = t.Local().Format("2006-01-02 15:04:05")
							}
							label := agentLabel(m.Command) + " (Running)"
							fmt.Printf("\n%s\n[%s] %s\n%s\n", separator, ts, label, separator)
						}
					}
				}
			}
		case <-ticker.C:
			if activeMsgID == "" {
				msgs, err := c.listMessages(args.sessionID)
				if err == nil {
					for i := len(msgs) - 1; i >= 0; i-- {
						if msgs[i].Type == "agent-run" {
							activeMsgID = msgs[i].ID
							if args.output != "json" {
								separator := strings.Repeat("─", 60)
								ts := msgs[i].CreatedAt
								if t, err := time.Parse(time.RFC3339, msgs[i].CreatedAt); err == nil {
									ts = t.Local().Format("2006-01-02 15:04:05")
								}
								label := agentLabel(msgs[i].Command) + " (Running)"
								fmt.Printf("\n%s\n[%s] %s\n%s\n", separator, ts, label, separator)
							}
							break
						}
					}
				}
			} else if args.output != "json" {
				log, err := c.getSessionLog(args.sessionID, activeMsgID)
				if err == nil && len(log) > printedLen {
					fmt.Print(log[printedLen:])
					printedLen = len(log)
				}
			}
			s, err := c.getSession(args.sessionID)
			if err == nil && (s.Status == "done" || s.Status == "error") {
				done = true
			}
		case <-deadline.C:
			return fmt.Errorf("session %s did not finish within %s", args.sessionID, timeout)
		}
	}

	if args.output == "json" {
		finalMessages, err := c.listMessages(args.sessionID)
		if err != nil {
			return err
		}
		convMessages, err := c.conversationMessages(args.sessionID, finalMessages)
		if err != nil {
			return err
		}
		return outputJSONMessages(convMessages, args.withLogs)
	}

	if activeMsgID != "" {
		finalLog, err := c.getSessionLog(args.sessionID, activeMsgID)
		if err == nil && len(finalLog) > printedLen {
			fmt.Print(finalLog[printedLen:])
			printedLen = len(finalLog)
		}
		if printedLen > 0 && !strings.HasSuffix(finalLog, "\n") {
			fmt.Println()
		}
	}

	finalMessages, err := c.listMessages(args.sessionID)
	if err == nil {
		seen := make(map[string]bool)
		for _, msg := range priorMessages {
			seen[msg.ID] = true
		}
		if activeMsgID != "" {
			seen[activeMsgID] = true
		}
		for _, msg := range finalMessages {
			if seen[msg.ID] {
				continue
			}
			switch msg.Type {
			case "script-run", "script-return", "agent-return", "detached-agent-run", "detached-agent-return", "user-todo":
				continue
			case "agent-run":
				log, err := c.getSessionLog(args.sessionID, msg.ID)
				if err == nil {
					msg.Content = log
				}
			}
			printPlainMessage(msg, false)
		}
	}

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

	var ws *wsClient
	if args.follow {
		ws, _ = dialWebSocket(args.server, args.token, 5*time.Second)
		if ws != nil {
			defer ws.Close()
		}
	}

	sess, err := c.getSession(args.sessionID)
	if err != nil {
		return err
	}

	messages, err := c.listMessages(args.sessionID)
	if err != nil {
		return err
	}

	if !args.follow || sess.Status != "running" {
		convMessages, err := c.conversationMessages(args.sessionID, messages)
		if err != nil {
			return err
		}
		if args.output == "json" {
			return outputJSONMessages(convMessages, args.withLogs)
		}
		for _, msg := range convMessages {
			printPlainMessage(msg, sess.Status == "running")
		}
		return nil
	}

	return followRunningAgent(c, args, sess, messages, ws)
}
