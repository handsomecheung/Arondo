package main

import "testing"

func TestParseArgsDecisionMode(t *testing.T) {
	args, err := parseArgs([]string{
		"--server", "http://localhost:3251",
		"--client-token", "test-token",
		"--no-path",
		"--agent", "decision",
		"Should we deploy now?",
	}, cliConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if args.agentType != "decision" {
		t.Fatalf("expected agentType decision, got %q", args.agentType)
	}

	argsJev, err := parseArgs([]string{
		"--server", "http://localhost:3251",
		"--client-token", "test-token",
		"--no-path",
		"--agent", "jev",
		"Should we deploy now?",
	}, cliConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if argsJev.agentType != "decision" {
		t.Fatalf("expected agentType decision when specifying jev, got %q", argsJev.agentType)
	}
}

func TestParseDecideArgs(t *testing.T) {
	prompt := `{"questions":{"is_ready":{"type":"noul","instructions":"Is ready?"}}}`
	args, err := parseDecideArgs([]string{
		"--server", "http://localhost:3251",
		"--client-token", "test-token",
		prompt,
	}, cliConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if args.agentType != "decision" {
		t.Fatalf("expected agentType 'decision', got %q", args.agentType)
	}
	if !args.tempDir {
		t.Fatalf("expected tempDir to be true")
	}
	if !args.once {
		t.Fatalf("expected once to be true")
	}
	if args.prompt != prompt {
		t.Fatalf("expected prompt %q, got %q", prompt, args.prompt)
	}

	// Missing prompt
	_, errMissing := parseDecideArgs([]string{
		"--server", "http://localhost:3251",
		"--client-token", "test-token",
	}, cliConfig{})
	if errMissing == nil {
		t.Fatalf("expected error when prompt is missing")
	}
}

