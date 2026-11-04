package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os/exec"
	"time"
)

type opencodeUsageWindow struct {
	Percent  *float64 `json:"percent"`
	Limited  bool     `json:"limited"`
	ResetsAt *int64   `json:"resetsAt"`
}

type OpencodeQuota struct {
	Account         string
	Plan            string
	FiveHourRemain  *float64
	FiveHourResetAt *int64
	WeeklyRemain    *float64
	WeeklyResetAt   *int64
	MonthlyRemain   *float64
	MonthlyResetAt  *int64
}

func opencodeWindow(window *opencodeUsageWindow) (*float64, *int64) {
	if window == nil || window.Percent == nil {
		return nil, nil
	}
	remain := math.Max(0, math.Min(1, 1-*window.Percent/100))
	if window.Limited {
		remain = 0
	}
	var reset *int64
	if window.ResetsAt != nil {
		seconds := *window.ResetsAt / 1000
		reset = &seconds
	}
	return &remain, reset
}

func parseOpencodeQuota(output []byte) (*OpencodeQuota, error) {
	var response struct {
		Data *struct {
			Workspace struct {
				ID string `json:"id"`
			} `json:"workspace"`
			Go *struct {
				Rolling *opencodeUsageWindow `json:"rolling"`
				Weekly  *opencodeUsageWindow `json:"weekly"`
				Monthly *opencodeUsageWindow `json:"monthly"`
			} `json:"go"`
		} `json:"data"`
	}
	if err := json.Unmarshal(output, &response); err != nil {
		return nil, err
	}
	if response.Data == nil || response.Data.Go == nil || response.Data.Workspace.ID == "" {
		return nil, fmt.Errorf("OpenCode Go usage unavailable; sign in to OpenCode Console with OpenCode v2")
	}
	// The usage response identifies Go quota, but does not expose the subscription tier.
	quota := &OpencodeQuota{Account: response.Data.Workspace.ID, Plan: "Go"}
	quota.FiveHourRemain, quota.FiveHourResetAt = opencodeWindow(response.Data.Go.Rolling)
	quota.WeeklyRemain, quota.WeeklyResetAt = opencodeWindow(response.Data.Go.Weekly)
	quota.MonthlyRemain, quota.MonthlyResetAt = opencodeWindow(response.Data.Go.Monthly)
	return quota, nil
}

func fetchOpencodeQuota(client *Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	// OpenCode owns authentication; credentials never leave the runner.
	output, err := exec.CommandContext(ctx, "opencode", "api", "GET", "/api/experimental/usage/limits").Output()
	if err != nil {
		log.Printf("[quota/opencode] usage request failed: %v", err)
		return
	}
	quota, err := parseOpencodeQuota(output)
	if err != nil {
		log.Printf("[quota/opencode] %v", err)
		return
	}
	sendQuotaUpdate(client, "opencode", quota)
}
