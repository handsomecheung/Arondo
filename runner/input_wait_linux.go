//go:build linux

package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// processTreeWaitingForTTYInput reports whether the task's process or any of
// its descendants is blocked in a Linux TTY read wait channel. Descendants are
// walked by parent PID because interactive shells put foreground commands in
// their own process group.
func processTreeWaitingForTTYInput(pid int) bool {
	for _, candidate := range append(getDescendantPIDs(pid), pid) {
		wchan, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(candidate), "wchan"))
		if err == nil && isTTYReadWaitChannel(string(wchan)) {
			return true
		}
	}
	return false
}

func isTTYReadWaitChannel(wchan string) bool {
	wchan = strings.TrimSpace(wchan)
	return wchan == "n_tty_read" || wchan == "tty_read" || wchan == "wait_woken" || strings.HasSuffix(wchan, "_tty_read")
}
