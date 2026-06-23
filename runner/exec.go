package main

import (
	"log"
	"os/exec"
	"strings"
)

// execCommand is a helper that wraps exec.Command and logs the command execution.
func execCommand(name string, arg ...string) *exec.Cmd {
	log.Printf("Executing command: %s %s", name, strings.Join(arg, " "))
	return exec.Command(name, arg...)
}
