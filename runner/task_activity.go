package main

import (
	"fmt"
	"sync"
)

type taskActivity struct {
	mu       sync.Mutex
	active   int
	updating bool
}

func (a *taskActivity) begin() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.updating {
		return fmt.Errorf("runner is applying an update; retry after it reconnects")
	}
	a.active++
	return nil
}

// Each launched process retains activity until its exit callback has returned.
func (a *taskActivity) retainProcess() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.active++
}

func (a *taskActivity) end() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.active--
}

func (a *taskActivity) tryBeginUpdate() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.active != 0 || a.updating {
		return false
	}
	a.updating = true
	return true
}

func (a *taskActivity) finishUpdate() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.updating = false
}
