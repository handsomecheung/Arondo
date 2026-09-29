//go:build !linux

package main

func processGroupWaitingForTTYInput(pid int) bool {
	return false
}
