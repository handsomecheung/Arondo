package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFailedWebSocketCompletionRefreshesMissingReason(t *testing.T) {
	const reason = "Invalid model selection. Update the model in Admin Settings."
	for _, format := range []string{"plain", "json"} {
		t.Run(format, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/sessions/failed-session":
					_ = json.NewEncoder(w).Encode(map[string]any{"id": "failed-session", "status": "error", "errorMessage": reason})
				case "/api/messages":
					_ = json.NewEncoder(w).Encode([]any{})
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			ws := &wsClient{closed: true, eventsChan: make(chan wsEvent, 1)}
			ws.eventsChan <- wsEvent{Type: "session:updated", Payload: json.RawMessage(`{"id":"failed-session","status":"error"}`)}
			c := &client{server: server.URL, token: "secret", http: server.Client()}
			result, _, _, _, err := streamSessionUntilDone(c, arguments{output: format}, "failed-session", "", ws, time.Second, 2*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			if result.Status != "error" || result.ErrorMessage != reason {
				t.Fatalf("failure reason was lost: %#v", result)
			}
		})
	}
}
