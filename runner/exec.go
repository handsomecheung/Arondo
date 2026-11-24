package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func defaultShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	return "bash"
}

func scriptShell(command string) (string, []string) {
	shell := defaultShell()
	flag := "-c"
	if filepath.Base(shell) == "zsh" {
		flag = "-ic"
	}
	return shell, []string{flag, command}
}

// execCommand is a helper that wraps exec.Command and logs the command execution.
func execCommand(name string, arg ...string) *exec.Cmd {
	log.Printf("Executing command: %s %s", name, strings.Join(arg, " "))
	return exec.Command(name, arg...)
}
