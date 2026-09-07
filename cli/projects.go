package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

const getProjectsUsage = `List all accessible projects.

Usage:
  cli/arondo-cli get-projects \
    --server http://localhost:3251 \
    --client-token <client_access_token>

Options:
  --server <url>      Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token> Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --output <format>   Output format: plain or json (default: plain)
  --help              Show this help message`

type getProjectsArguments struct {
	server, token, output string
}

func parseGetProjectsArgs(argv []string, config cliConfig) (getProjectsArguments, error) {
	server, token := configuredServerAndToken(config)
	args := getProjectsArguments{server: server, token: token, output: "plain"}
	valueOptions := map[string]*string{"--server": &args.server, "--client-token": &args.token, "--output": &args.output}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" {
			return getProjectsArguments{}, errHelp
		}
		if !strings.HasPrefix(option, "--") {
			return getProjectsArguments{}, fmt.Errorf("unexpected argument: %s", option)
		}
		name, value, inline := strings.Cut(option, "=")
		destination, ok := valueOptions[name]
		if !ok {
			return getProjectsArguments{}, fmt.Errorf("unknown option: %s", option)
		}
		if !inline {
			index++
			if index >= len(argv) {
				return getProjectsArguments{}, fmt.Errorf("option %s requires a value", name)
			}
			value = argv[index]
		}
		if value == "" || strings.HasPrefix(value, "--") {
			return getProjectsArguments{}, fmt.Errorf("option %s requires a value", name)
		}
		*destination = value
	}
	if args.output != "plain" && args.output != "json" {
		return getProjectsArguments{}, fmt.Errorf("--output must be plain or json")
	}
	return args, validateServerAndToken(args.server, args.token)
}

type project struct {
	ID        string `json:"id"`
	RunnerID  string `json:"runnerId"`
	RepoPath  string `json:"repoPath"`
	TempDir   bool   `json:"tempDir"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (c *client) listProjects() ([]project, error) {
	var projects []project
	if err := c.request(http.MethodGet, "/api/projects", nil, &projects); err != nil {
		return nil, err
	}
	filtered := projects[:0]
	for _, p := range projects {
		if !p.TempDir {
			filtered = append(filtered, p)
		}
	}
	return filtered, nil
}

func getProjects(c *client, args getProjectsArguments) error {
	projects, err := c.listProjects()
	if err != nil {
		return err
	}
	if args.output == "json" {
		pretty, _ := json.MarshalIndent(projects, "", "  ")
		fmt.Println(string(pretty))
		return nil
	}
	if len(projects) == 0 {
		fmt.Println("no projects")
		return nil
	}
	for i, p := range projects {
		if i > 0 {
			fmt.Println()
		}
		fmt.Printf("project: %s\n  runner: %s\n  path:   %s\n", p.ID, p.RunnerID, p.RepoPath)
	}
	return nil
}
