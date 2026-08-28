package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
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

Options:
  --server <url>        Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --session-id <id>     Session ID to display
  --latest              Use the most recently updated session for the runner and repository path
  --runner-id <id>      Target runner ID (default: connected runner with the current hostname)
  --path <path>         Repository path on the runner (default: current working directory)
  --with-logs           Include agent stdout in a log field for json output (default: false)
  --output <format>     Output format: plain or json (default: plain)
  --help                Show this help message`

type getMessagesArguments struct {
	server, token, sessionID, runnerID, repoPath, output string
	withLogs, latest                                     bool
}

func parseGetMessagesArgs(argv []string, config cliConfig) (getMessagesArguments, error) {
	server, token := configuredServerAndToken(config)
	args := getMessagesArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{
		"--server": &args.server, "--client-token": &args.token, "--session-id": &args.sessionID,
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
