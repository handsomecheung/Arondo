package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestCheckConnectionDoesNotRegister(t *testing.T) {
	applicationMessages := make(chan int, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-runner-token") != "check-token" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		count := 0
		defer func() { applicationMessages <- count }()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
			count++
		}
	}))
	defer server.Close()

	if err := checkConnection(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http"), "check-token"); err != nil {
		t.Fatal(err)
	}
	select {
	case count := <-applicationMessages:
		if count != 0 {
			t.Fatalf("check sent %d application messages; expected only control frames", count)
		}
	case <-time.After(time.Second):
		t.Fatal("check did not close its connection")
	}
}

func TestCheckConnectionRejectsAuthenticationFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}))
	defer server.Close()
	err := checkConnection(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http"), "bad-token")
	if err == nil || !strings.Contains(err.Error(), "HTTP 401") {
		t.Fatalf("expected authentication error, got %v", err)
	}
}

func TestCheckConnectionPongTimeout(t *testing.T) {
	for _, wrongPong := range []bool{false, true} {
		name := "no-pong"
		if wrongPong {
			name = "mismatched-pong"
		}
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				upgrader := websocket.Upgrader{}
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					t.Error(err)
					return
				}
				defer conn.Close()
				conn.SetPingHandler(func(string) error {
					if wrongPong {
						return conn.WriteControl(websocket.PongMessage, []byte("wrong-pong"), time.Now().Add(time.Second))
					}
					return nil
				})
				for {
					if _, _, err := conn.ReadMessage(); err != nil {
						return
					}
				}
			}))
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
			defer cancel()
			err := checkConnection(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), "check-token")
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("expected pong deadline exceeded, got %v", err)
			}
		})
	}
}

func TestCheckConnectionHandshakeTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	started := time.Now()
	err := checkConnection(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), "check-token")
	if err == nil {
		t.Fatal("expected handshake timeout")
	}
	if time.Since(started) > 2*time.Second {
		t.Fatal("handshake did not respect the check deadline")
	}
}

func TestCheckConnectionServerClosesBeforePong(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		conn.Close()
	}))
	defer server.Close()
	if err := checkConnection(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http"), "check-token"); err == nil {
		t.Fatal("expected failure when the server closes before pong")
	}
}
