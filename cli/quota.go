package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const getQuotaUsage = `List the recorded quota usage for all accessible runners.

Usage:
  cli/arondo-cli get-quota \
    --server http://localhost:3251 \
    --client-token <client_access_token>

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

const updateQuotaUsage = `Force an asynchronous quota refresh for all accessible runners.

Usage:
  cli/arondo-cli update-quota \
    --server http://localhost:3251 \
    --client-token <client_access_token>

The command returns after refresh requests have been queued. Use get-quota to read the updated values.

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

type quotaArguments struct {
	server, token, output string
}

func parseQuotaArgs(argv []string, config cliConfig) (quotaArguments, error) {
	server, token := configuredServerAndToken(config)
	args := quotaArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{"--server": &args.server, "--client-token": &args.token, "--output": &args.output}

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

func (c *client) updateQuota() (map[string]any, error) {
	result := map[string]any{}
	return result, c.request(http.MethodPost, "/api/agents/quota", map[string]any{}, &result)
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
