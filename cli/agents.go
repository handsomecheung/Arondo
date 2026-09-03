package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const listAgentsUsage = `List agent availability for all accessible runners.

Usage:
  cli/arondo-cli list-agents \
    --server http://localhost:3251 \
    --client-token <client_access_token>

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --runner-id <id>    Only show one runner
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

type listAgentsArguments struct {
	server, token, runnerID, output string
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

func parseListAgentsArgs(argv []string, config cliConfig) (listAgentsArguments, error) {
	server, token := configuredServerAndToken(config)
	args := listAgentsArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{"--server": &args.server, "--client-token": &args.token, "--runner-id": &args.runnerID, "--output": &args.output}

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
		if quotaNumberBelow(quota, "FiveHourRemain", 0.15) {
			return "5-hour quota below 15%"
		}
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
