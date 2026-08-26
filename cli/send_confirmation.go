package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
)

func (c *client) createQueuedSession(args arguments, trigger string) (session, error) {
	payload := map[string]any{"prompt": args.prompt, "agentType": args.agentType, "isDraft": true, "draftTrigger": trigger}
	if args.tempDir {
		payload["tempDir"] = true
	} else {
		payload["repoPath"] = args.repoPath
	}
	if args.runnerID != "" {
		payload["runnerId"] = args.runnerID
	}
	var session session
	return session, c.request(http.MethodPost, "/api/sessions", payload, &session)
}

func (c *client) queueMessage(sessionID string, args arguments, trigger string) error {
	payload := map[string]any{"message": args.prompt, "trigger": map[string]any{"kind": trigger}}
	return c.request(http.MethodPost, "/api/sessions/"+url.PathEscape(sessionID)+"/todo-messages", payload, &map[string]any{})
}

func isNeedsConfirmation(err error) (*apiError, bool) {
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.body["needsConfirmation"] == true {
		return apiErr, true
	}
	return nil, false
}

func confirmationAutoTrigger(apiErr *apiError) string {
	reason, _ := apiErr.body["reason"].(map[string]any)
	if isFollowup, _ := reason["isFollowup"].(bool); isFollowup {
		return "afterSession"
	}
	return "codebaseReady"
}

func (c *client) resolveCreateConfirmation(args arguments, err error) (session, bool, string, error) {
	if _, ok := isNeedsConfirmation(err); !ok || args.confirmation == "" {
		return session{}, false, "", err
	}
	switch args.confirmation {
	case "force":
		created, retryErr := c.createSession(args, true)
		return created, false, "", retryErr
	case "auto":
		created, retryErr := c.createQueuedSession(args, "codebaseReady")
		return created, true, "codebaseReady", retryErr
	case "draft":
		created, retryErr := c.createQueuedSession(args, "manual")
		return created, true, "manual", retryErr
	}
	return session{}, false, "", err
}

func (c *client) resolveMessageConfirmation(sessionID string, args arguments, err error) (bool, string, error) {
	apiErr, ok := isNeedsConfirmation(err)
	if !ok || args.confirmation == "" {
		return false, "", err
	}
	switch args.confirmation {
	case "force":
		return false, "", c.sendMessage(sessionID, args, true)
	case "auto":
		trigger := confirmationAutoTrigger(apiErr)
		return true, trigger, c.queueMessage(sessionID, args, trigger)
	case "draft":
		return true, "manual", c.queueMessage(sessionID, args, "manual")
	}
	return false, "", err
}

func outputQueuedResult(c *client, sessionID string, args arguments, trigger string) error {
	session, err := c.getSession(sessionID)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "Queued message in session %s (trigger=%s).\n", sessionID, trigger)
	if args.output == "json" {
		result := session.Raw
		if result == nil {
			result = map[string]any{}
		}
		delete(result, "id")
		result["sessionId"] = sessionID
		result["queued"] = true
		result["todoTrigger"] = trigger
		fmt.Fprintln(os.Stderr, "\n=== Result ===")
		pretty, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(pretty))
	} else {
		fmt.Printf("Queued message in session %s (trigger=%s)\n", sessionID, trigger)
	}
	return nil
}
