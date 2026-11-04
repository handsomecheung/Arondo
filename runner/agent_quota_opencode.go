package main

import (
	"context"
	"encoding/json"
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
	IsAPIKey        bool
}

// Plan labels reported to the server. Only the "Go" label identifies a
// subscription whose usage windows can be tracked; the others describe
// accounts that have no Go quota to report.
const (
	opencodePlanGo      = "Go"
	opencodePlanFree    = "Free"
	opencodePlanAPIKey  = "API Key"
	opencodePlanUnknown = "Unknown"

	// Account label used when no OpenCode Console account is connected, so
	// the server still has a stable identity to key the quota record on.
	opencodeAccountUnauthenticated = "unauthenticated"
)

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

// opencodeAuth describes how the runner's OpenCode installation is billed.
type opencodeAuth struct {
	// APIKey is true when the installation authenticates with a provider
	// API key instead of an OpenCode Console account.
	APIKey bool
	// Known is false when the stored credential could not be inspected.
	Known bool
}

// readOpencodeAuth inspects the stored OpenCode Console credential to learn
// whether the installation is signed in to the Console or uses API-key
// billing. A Console account connected with an OAuth credential is a
// subscription user; a key credential is API-key billed.
func readOpencodeAuth(ctx context.Context) opencodeAuth {
	out, err := exec.CommandContext(ctx, "opencode", "api", "GET", "/api/integration").Output()
	if err != nil {
		log.Printf("[quota/opencode] auth lookup failed: %v", err)
		return opencodeAuth{}
	}

	var response struct {
		Data []struct {
			ID          string `json:"id"`
			Connections []struct {
				Type   string `json:"type"`
				ID     string `json:"id"`
				Label  string `json:"label"`
				Method string `json:"method"`
			} `json:"connections"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &response); err != nil {
		log.Printf("[quota/opencode] auth response unreadable: %v", err)
		return opencodeAuth{}
	}

	for _, integration := range response.Data {
		if integration.ID != "opencode" {
			continue
		}
		for _, connection := range integration.Connections {
			return opencodeAuth{APIKey: connection.Method == "key", Known: true}
		}
	}
	// The Console integration exists but has no connected credential.
	return opencodeAuth{APIKey: true, Known: true}
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
	if response.Data == nil {
		// The endpoint answered without usage data, so the billing mode is
		// unknown. The account label stays empty until the credential lookup
		// resolves it.
		return &OpencodeQuota{Account: opencodeAccountUnauthenticated, Plan: opencodePlanUnknown}, nil
	}

	workspaceID := response.Data.Workspace.ID
	if workspaceID == "" {
		// No workspace is billed, so there is no Go usage to report.
		return &OpencodeQuota{Account: opencodeAccountUnauthenticated, Plan: opencodePlanUnknown}, nil
	}

	if response.Data.Go == nil {
		// Signed in to the Console but without a Go subscription.
		return &OpencodeQuota{Account: workspaceID, Plan: opencodePlanFree}, nil
	}

	// The usage response identifies Go quota, but does not expose the subscription tier.
	quota := &OpencodeQuota{Account: workspaceID, Plan: opencodePlanGo}
	quota.FiveHourRemain, quota.FiveHourResetAt = opencodeWindow(response.Data.Go.Rolling)
	quota.WeeklyRemain, quota.WeeklyResetAt = opencodeWindow(response.Data.Go.Weekly)
	quota.MonthlyRemain, quota.MonthlyResetAt = opencodeWindow(response.Data.Go.Monthly)
	return quota, nil
}

func fetchOpencodeQuota(client *Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	auth := readOpencodeAuth(ctx)

	// OpenCode owns authentication; credentials never leave the runner.
	output, err := exec.CommandContext(ctx, "opencode", "api", "GET", "/api/experimental/usage/limits").Output()
	if err != nil {
		log.Printf("[quota/opencode] usage request failed: %v", err)
	}

	quota, parseErr := parseOpencodeQuota(output)
	if parseErr != nil {
		log.Printf("[quota/opencode] %v", parseErr)
		quota = &OpencodeQuota{Account: opencodeAccountUnauthenticated, Plan: opencodePlanUnknown}
	}

	// The stored credential resolves the billing mode whenever the usage
	// response could not: an API-key credential is billed per request, an
	// OAuth credential is a signed-in Console account.
	if quota.Plan == opencodePlanUnknown {
		switch {
		case auth.Known && auth.APIKey:
			quota.Plan = opencodePlanAPIKey
			quota.IsAPIKey = true
		case auth.Known:
			quota.Plan = opencodePlanFree
		}
	} else if auth.Known && auth.APIKey {
		// A Console account connected with an API key is billed per request,
		// so its usage windows are not a subscription quota.
		quota.IsAPIKey = true
		quota.Plan = opencodePlanAPIKey
	}

	sendQuotaUpdate(client, "opencode", quota)
}
