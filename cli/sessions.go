package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

const getSessionsUsage = `List active sessions.

Usage:
  cli/arondo-cli get-sessions \
    --server http://localhost:3251 \
    --client-token <client_access_token>

Options:
  --server <url>         Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --runner-id <id>       Filter sessions by runner ID
  --path <path>          Filter sessions by repository path
  --count <number>       Maximum number of sessions to return
  --output <format>      Output format: plain or json (default: plain)
  --help                 Show this help message`

type getSessionsArguments struct {
	server, token, runnerID, repoPath, output string
	count                                     int
}

func parseGetSessionsArgs(argv []string, config cliConfig) (getSessionsArguments, error) {
	server, token := configuredServerAndToken(config)
	args := getSessionsArguments{server: server, token: token, output: "plain", count: -1}
	valueOptions := map[string]*string{
		"--server":       &args.server,
		"--client-token": &args.token,
		"--runner-id":   &args.runnerID,
		"--path":        &args.repoPath,
		"--output":      &args.output,
	}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" || option == "-h" {
			return getSessionsArguments{}, errHelp
		}
		if !strings.HasPrefix(option, "--") {
			return getSessionsArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		if name == "--count" {
			if !inline {
				index++
				if index >= len(argv) {
					return getSessionsArguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			if value == "" || strings.HasPrefix(value, "--") {
				return getSessionsArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed < 0 {
				return getSessionsArguments{}, errors.New("--count must be a non-negative integer")
			}
			args.count = parsed
			continue
		}
		destination, ok := valueOptions[name]
		if !ok {
			return getSessionsArguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return getSessionsArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return getSessionsArguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}
	if args.output != "plain" && args.output != "json" {
		return getSessionsArguments{}, errors.New("--output must be plain or json")
	}
	return args, validateServerAndToken(args.server, args.token)
}

func getSessions(c *client, args getSessionsArguments) error {
	sessions, err := c.listSessions()
	if err != nil {
		return err
	}
	var filtered []session
	for _, s := range sessions {
		if args.runnerID != "" && s.RunnerID != args.runnerID {
			continue
		}
		if args.repoPath != "" && s.RepoPath != args.repoPath {
			continue
		}
		filtered = append(filtered, s)
	}

	if args.count >= 0 && len(filtered) > args.count {
		filtered = filtered[:args.count]
	}

	if args.output == "json" {
		raws := make([]map[string]any, 0, len(filtered))
		for _, s := range filtered {
			if s.Raw != nil {
				raws = append(raws, s.Raw)
			}
		}
		pretty, _ := json.MarshalIndent(raws, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}

	if len(filtered) == 0 {
		fmt.Println("no sessions")
		return nil
	}

	for i, s := range filtered {
		if i > 0 {
			fmt.Println()
		}
		fmt.Printf("session: %s\n", s.ID)
		if s.Name != "" {
			fmt.Printf("  name:   %s\n", s.Name)
		}
		statusStr := s.Status
		if s.Status == "error" && s.ErrorMessage != "" {
			statusStr = fmt.Sprintf("%s (%s)", s.Status, s.ErrorMessage)
		}
		fmt.Printf("  status: %s\n", statusStr)
		if s.AgentType != "" {
			fmt.Printf("  agent:  %s\n", s.AgentType)
		}
		fmt.Printf("  runner: %s\n", s.RunnerID)
		if s.RepoPath != "" {
			fmt.Printf("  path:   %s\n", s.RepoPath)
		}
	}
	return nil
}
