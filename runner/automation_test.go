package main

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestAutomationWorkspacesAreUniqueAndUseRunnerConfig(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("ARONDO_CONFIG_DIR", configDir)
	first, err := createAutomationWorkspace()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(first, "retained.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	second, err := createAutomationWorkspace()
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("automation workspaces must never be reused")
	}
	for _, dir := range []string{first, second} {
		if filepath.Dir(dir) != filepath.Join(configDir, "automation-workspaces") {
			t.Fatalf("workspace is outside runner config directory: %s", dir)
		}
		if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z-[a-zA-Z0-9]+$`).MatchString(filepath.Base(dir)) {
			t.Fatalf("workspace name lacks UTC datetime and random suffix: %s", dir)
		}
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			t.Fatalf("workspace is not a directory: %s (%v)", dir, err)
		}
	}
	if data, err := os.ReadFile(filepath.Join(first, "retained.txt")); err != nil || string(data) != "keep" {
		t.Fatal("creating another workspace must preserve existing files")
	}
}
