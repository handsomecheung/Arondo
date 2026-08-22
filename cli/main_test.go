package main

import (
	"errors"
	"testing"
)

func TestParseArgs(t *testing.T) {
	args, err := parseArgs([]string{"--server=https://arondo.example/", "--token", "secret", "--temp-dir", "--agent", "codex", "--poll-interval=0.5", "--timeout", "12", "Do work"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || !args.tempDir || args.agentType != "codex" || args.pollInterval != 0.5 || args.timeout != 12 || args.prompt != "Do work" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsRejectsInvalidCombinations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--resume", "--temp-dir", "message"}, nil)
	if err == nil || err.Error() != "--resume cannot be used with --temp-dir" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsNonFiniteDurations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--timeout", "NaN", "message"}, nil)
	if err == nil || err.Error() != "--timeout must be a non-negative number" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsReturnsHelp(t *testing.T) {
	_, err := parseArgs([]string{"--help"}, nil)
	if !errors.Is(err, errHelp) {
		t.Fatalf("expected help error, got %v", err)
	}
}

func TestLoadDotEnv(t *testing.T) {
	values, err := loadDotEnv("testdata/env")
	if err != nil {
		t.Fatal(err)
	}
	if values["ARONDO_URL"] != "https://arondo.example" || values["ARONDO_TOKEN"] != "token value" {
		t.Fatalf("unexpected values: %#v", values)
	}
}
