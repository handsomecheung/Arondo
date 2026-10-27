package main

import (
	"os"
	"path/filepath"
	"time"
)

func createAutomationWorkspace() (string, error) {
	configDir := os.Getenv("ARONDO_CONFIG_DIR")
	if configDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		configDir = filepath.Join(home, ".arondo")
	}
	root, err := filepath.Abs(filepath.Join(configDir, "automation-workspaces"))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	return os.MkdirTemp(root, time.Now().UTC().Format("2006-01-02_15-04-05Z")+"-")
}
