//go:build linux

package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// processGroupWaitingForTTYInput reports whether a process in the task's
// process group is blocked in a Linux TTY read wait channel.
func processGroupWaitingForTTYInput(pid int) bool {
	group, ok := processGroupID(pid)
	if !ok {
		return false
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false
	}
	for _, entry := range entries {
		candidate, err := strconv.Atoi(entry.Name())
		if err != nil || candidate <= 0 {
			continue
		}
		candidateGroup, ok := processGroupID(candidate)
		if !ok || candidateGroup != group {
			continue
		}
		wchan, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "wchan"))
		if err == nil && isTTYReadWaitChannel(string(wchan)) {
			return true
		}
	}
	return false
}

func processGroupID(pid int) (int, bool) {
	stat, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "stat"))
	if err != nil {
		return 0, false
	}
	end := strings.LastIndex(string(stat), ")")
	if end < 0 {
		return 0, false
	}
	fields := strings.Fields(string(stat)[end+1:])
	if len(fields) < 3 {
		return 0, false
	}
	group, err := strconv.Atoi(fields[2])
	return group, err == nil
}

func isTTYReadWaitChannel(wchan string) bool {
	wchan = strings.TrimSpace(wchan)
	return wchan == "n_tty_read" || wchan == "tty_read" || wchan == "wait_woken" || strings.HasSuffix(wchan, "_tty_read")
}
