//go:build !linux

package main

func processTreeWaitingForTTYInput(pid int) bool {
	return false
}
