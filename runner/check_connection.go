package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const connectionCheckTimeout = 10 * time.Second

func checkConnection(ctx context.Context, serverURL, token string) error {
	ctx, cancel := context.WithTimeout(ctx, connectionCheckTimeout)
	defer cancel()

	header := http.Header{}
	if token != "" {
		header.Set("x-runner-token", token)
	}
	conn, response, err := websocket.DefaultDialer.DialContext(ctx, serverURL, header)
	if err != nil {
		if response != nil {
			response.Body.Close()
			return fmt.Errorf("websocket handshake failed (HTTP %d): %w", response.StatusCode, err)
		}
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close()
	stopClosing := context.AfterFunc(ctx, func() { conn.Close() })
	defer stopClosing()

	result := make(chan error, 1)
	ping := NewID()
	conn.SetPongHandler(func(data string) error {
		if data == ping {
			select {
			case result <- nil:
			default:
			}
		}
		return nil
	})
	deadline, _ := ctx.Deadline()
	if err := conn.WriteControl(websocket.PingMessage, []byte(ping), deadline); err != nil {
		return fmt.Errorf("send ping: %w", err)
	}
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				select {
				case result <- fmt.Errorf("receive pong: %w", err):
				default:
				}
				return
			}
		}
	}()
	select {
	case err := <-result:
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
