package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestScriptShellLoadsZshAliases(t *testing.T) {
	zsh, err := exec.LookPath("zsh")
	if err != nil {
		t.Skip("zsh is not installed")
	}
	configDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(configDir, ".zshrc"), []byte("alias arondo_test_alias='printf arondo-alias-loaded'\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SHELL", zsh)
	t.Setenv("ZDOTDIR", configDir)

	shell, args := scriptShell("arondo_test_alias; exit 7")
	output, err := execCommand(shell, args...).CombinedOutput()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) || exitErr.ExitCode() != 7 {
		t.Fatalf("expected exit code 7, got %v; output: %s", err, output)
	}
	if !strings.Contains(string(output), "arondo-alias-loaded") {
		t.Fatalf("alias from .zshrc was not executed: %s", output)
	}
}
