package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"
)

const decideUsage = `Run a fast categorical decision or classification using Jev System One.

Usage:
  cli/arondo-cli decide [options] '<JSON>'
  cat query.json | cli/arondo-cli decide [options]

Examples:
  cli/arondo-cli decide '{
    "state": "Our API integration started returning 500 errors...",
    "questions": {
      "department": {
        "type": "choice",
        "instructions": "Which team should handle this",
        "criteria": {
          "billing": "Payment or subscription issues",
          "technical": "Bugs or integration problems",
          "sales": "Pricing or account questions"
        }
      },
      "frustration": {
        "type": "score",
        "instructions": "How frustrated the customer appears",
        "criteria": [
          "Calm, just stating facts",
          "Frustrated but civil",
          "Very angry, strong language"
        ]
      },
      "is_urgent": {
        "type": "noul",
        "instructions": "The message conveys urgency or time-sensitivity"
      }
    }
  }'

Options:
  --server <url>               Arondo server base URL (overrides ARONDO_SERVER and cli.server in arondo.json)
  --client-token <token>       Client access token (overrides ARONDO_CLIENT_TOKEN and cli.clientToken in arondo.json)
  --poll-interval <seconds>    Seconds between status polls (default: 1)
  --timeout <seconds>          Maximum seconds to wait for completion (default: 60)
  --output <format>            Output format: plain or json (default: plain)
  --help                       Show this help message`

func parseDecideArgs(argv []string, config cliConfig) (arguments, error) {
	server, token := configuredServerAndToken(config)
	args := arguments{
		server:       server,
		token:        token,
		agentType:    "decision",
		tempDir:      true,
		once:         true,
		pollInterval: 1,
		timeout:      60,
		output:       "plain",
	}

	for index := 0; index < len(argv); index++ {
		option := argv[index]
		if option == "--help" || option == "-h" {
			return arguments{}, errHelp
		}
		if !strings.HasPrefix(option, "--") {
			if args.prompt != "" {
				return arguments{}, errors.New("only one message/JSON payload may be provided")
			}
			args.prompt = option
			continue
		}

		name, value, inline := strings.Cut(option, "=")
		switch name {
		case "--server":
			if !inline {
				index++
				if index >= len(argv) {
					return arguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			args.server = value
		case "--client-token":
			if !inline {
				index++
				if index >= len(argv) {
					return arguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			args.token = value
		case "--output":
			if !inline {
				index++
				if index >= len(argv) {
					return arguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			if value != "plain" && value != "json" {
				return arguments{}, errors.New("--output must be plain or json")
			}
			args.output = value
		case "--poll-interval", "--timeout":
			if !inline {
				index++
				if index >= len(argv) {
					return arguments{}, fmt.Errorf("option %s requires a value", name)
				}
				value = argv[index]
			}
			parsed, err := strconv.ParseFloat(value, 64)
			if err != nil || parsed < 0 {
				return arguments{}, fmt.Errorf("%s must be a non-negative number", name)
			}
			if name == "--poll-interval" {
				args.pollInterval = parsed
			} else {
				args.timeout = parsed
			}
		default:
			return arguments{}, fmt.Errorf("unknown option for decide: %s", option)
		}
	}

	if args.prompt == "" {
		stat, err := os.Stdin.Stat()
		if err == nil && (stat.Mode()&os.ModeCharDevice) == 0 {
			bytes, err := io.ReadAll(os.Stdin)
			if err == nil {
				args.prompt = strings.TrimSpace(string(bytes))
			}
		}
	}
	if args.prompt == "" {
		return arguments{}, errors.New("a JSON decision payload must be provided as an argument or via stdin")
	}

	if err := validateServerAndToken(args.server, args.token); err != nil {
		return arguments{}, err
	}

	return args, nil
}

func runDecide(c *client, args arguments) error {
	ws, _ := dialWebSocket(args.server, args.token, 5*time.Second)
	if ws != nil {
		defer ws.Close()
	}

	created, err := c.createSession(args, false)
	if err != nil {
		return err
	}
	sessionID := created.ID

	interval := time.Duration(args.pollInterval * float64(time.Second))
	timeout := time.Duration(args.timeout * float64(time.Second))

	session, rawOutput, agentCommand, _, err := streamSessionUntilDone(c, args, sessionID, "", ws, interval, timeout)
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
		pretty, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(pretty))
	}
	if session.Status == "error" {
		return errSession
	}
	return nil
}
