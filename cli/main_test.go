package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestParseArgs(t *testing.T) {
	args, err := parseArgs([]string{"--server=https://arondo.example/", "--token", "secret", "--temp-dir", "--agent", "codex", "--poll-interval=0.5", "--timeout", "12", "Do work"}, cliConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://arondo.example/" || args.token != "secret" || !args.tempDir || args.agentType != "codex" || args.pollInterval != 0.5 || args.timeout != 12 || args.prompt != "Do work" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsRejectsInvalidCombinations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--resume", "--temp-dir", "message"}, cliConfig{})
	if err == nil || err.Error() != "--resume cannot be used with --temp-dir" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsRejectsNonFiniteDurations(t *testing.T) {
	_, err := parseArgs([]string{"--server", "http://localhost", "--token", "secret", "--timeout", "NaN", "message"}, cliConfig{})
	if err == nil || err.Error() != "--timeout must be a non-negative number" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseArgsReturnsHelp(t *testing.T) {
	_, err := parseArgs([]string{"--help"}, cliConfig{})
	if !errors.Is(err, errHelp) {
		t.Fatalf("expected help error, got %v", err)
	}
}

func TestLoadConfig(t *testing.T) {
	config, err := loadConfig("testdata/arondo.json")
	if err != nil {
		t.Fatal(err)
	}
	if config.CLI.URL != "https://arondo.example" || config.CLI.Token != "token value" {
		t.Fatalf("unexpected config: %#v", config)
	}
}

func TestParseArgsUsesConfigAndArgumentsOverrideIt(t *testing.T) {
	t.Setenv("ARONDO_URL", "")
	t.Setenv("ARONDO_TOKEN", "")
	config := cliConfig{}
	config.CLI.URL = "https://configured.example"
	config.CLI.Token = "configured-token"

	args, err := parseArgs([]string{"--server", "https://argument.example", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://argument.example" || args.token != "configured-token" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestParseArgsUsesEnvironmentVariablesAndArgumentsOverrideThem(t *testing.T) {
	t.Setenv("ARONDO_URL", "https://environment.example")
	t.Setenv("ARONDO_TOKEN", "environment-token")
	config := cliConfig{}
	config.CLI.URL = "https://configured.example"
	config.CLI.Token = "configured-token"

	args, err := parseArgs([]string{"--token", "argument-token", "message"}, config)
	if err != nil {
		t.Fatal(err)
	}
	if args.server != "https://environment.example" || args.token != "argument-token" {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}

func TestConfigDirUsesEnvironmentOverride(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("ARONDO_CONFIG_DIR", directory)

	got, err := configDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != directory {
		t.Fatalf("configDir() = %q, want %q", got, directory)
	}
}

func TestLoadConfigRejectsInvalidJSON(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "arondo.json")
	if err := os.WriteFile(filePath, []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig(filePath); err == nil {
		t.Fatal("expected invalid JSON error")
	}
}
