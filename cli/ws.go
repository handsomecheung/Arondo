package main

import (
	"bufio"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type wsEvent struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId,omitempty"`
	MessageID string          `json:"messageId,omitempty"`
	Data      string          `json:"data,omitempty"`
	ExitCode  *int            `json:"exitCode,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type wsClient struct {
	conn       net.Conn
	br         *bufio.Reader
	mu         sync.Mutex
	closed     bool
	eventsChan chan wsEvent
}

func websocketURL(serverURL string) (string, error) {
	u, err := url.Parse(serverURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	case "wss", "ws":
		// already ws/wss
	default:
		u.Scheme = "ws"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/ws"
	} else if !strings.HasSuffix(u.Path, "/ws") {
		u.Path = strings.TrimRight(u.Path, "/") + "/ws"
	}
	return u.String(), nil
}

func dialWebSocket(serverURL, token string, timeout time.Duration) (*wsClient, error) {
	wsURLStr, err := websocketURL(serverURL)
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(wsURLStr)
	if err != nil {
		return nil, err
	}
	host := u.Host
	hostname := u.Hostname()
	port := u.Port()
	if port == "" {
		if u.Scheme == "wss" {
			port = "443"
		} else {
			port = "80"
		}
		host = net.JoinHostPort(hostname, port)
	}

	dialer := &net.Dialer{Timeout: timeout}
	var conn net.Conn
	if u.Scheme == "wss" {
		conn, err = tls.DialWithDialer(dialer, "tcp", host, &tls.Config{
			ServerName: hostname,
		})
	} else {
		conn, err = dialer.Dial("tcp", host)
	}
	if err != nil {
		return nil, err
	}

	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		_ = conn.Close()
		return nil, err
	}
	secKey := base64.StdEncoding.EncodeToString(keyBytes)

	req, err := http.NewRequest(http.MethodGet, wsURLStr, nil)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", secKey)
	req.Header.Set("Sec-WebSocket-Version", "13")
	if token != "" {
		req.Header.Set("Sec-WebSocket-Protocol", fmt.Sprintf("arondo-token, %s", token))
		req.Header.Set("x-arondo-token", token)
	} else {
		req.Header.Set("Sec-WebSocket-Protocol", "arondo-token")
	}

	if err := req.Write(conn); err != nil {
		_ = conn.Close()
		return nil, err
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, req)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		_ = conn.Close()
		return nil, fmt.Errorf("websocket upgrade failed with status %d", resp.StatusCode)
	}

	client := &wsClient{
		conn:       conn,
		br:         br,
		eventsChan: make(chan wsEvent, 1000),
	}

	go client.readLoop()
	return client, nil
}

func (ws *wsClient) readLoop() {
	defer func() {
		_ = ws.Close()
		close(ws.eventsChan)
	}()

	for {
		header := make([]byte, 2)
		if _, err := io.ReadFull(ws.br, header); err != nil {
			return
		}

		opcode := header[0] & 0x0F
		masked := (header[1] & 0x80) != 0
		payloadLen := uint64(header[1] & 0x7F)

		if payloadLen == 126 {
			var extLen uint16
			if err := binary.Read(ws.br, binary.BigEndian, &extLen); err != nil {
				return
			}
			payloadLen = uint64(extLen)
		} else if payloadLen == 127 {
			if err := binary.Read(ws.br, binary.BigEndian, &payloadLen); err != nil {
				return
			}
		}

		var maskKey []byte
		if masked {
			maskKey = make([]byte, 4)
			if _, err := io.ReadFull(ws.br, maskKey); err != nil {
				return
			}
		}

		data := make([]byte, payloadLen)
		if _, err := io.ReadFull(ws.br, data); err != nil {
			return
		}

		if masked {
			for i := uint64(0); i < payloadLen; i++ {
				data[i] ^= maskKey[i%4]
			}
		}

		switch opcode {
		case 0x9: // Ping
			_ = ws.writeControl(0xA, data)
		case 0x8: // Close
			return
		case 0x1: // Text frame
			var ev wsEvent
			if err := json.Unmarshal(data, &ev); err == nil {
				select {
				case ws.eventsChan <- ev:
				default:
				}
			}
		}
	}
}

func (ws *wsClient) writeControl(opcode byte, payload []byte) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if ws.closed {
		return nil
	}

	length := len(payload)
	header := make([]byte, 0, 6+length)
	header = append(header, 0x80|opcode)
	header = append(header, 0x80|byte(length))

	maskKey := make([]byte, 4)
	if _, err := rand.Read(maskKey); err != nil {
		return err
	}
	header = append(header, maskKey...)

	for i := 0; i < length; i++ {
		header = append(header, payload[i]^maskKey[i%4])
	}

	_, err := ws.conn.Write(header)
	return err
}

func (ws *wsClient) Close() error {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if ws.closed {
		return nil
	}
	ws.closed = true
	return ws.conn.Close()
}

func streamSessionUntilDone(c *client, args arguments, sessionID, messageID string, ws *wsClient, interval, timeout time.Duration) (session, string, bool, error) {
	var rawOutput strings.Builder
	var finalSession session
	var detachedRun message
	var detachedReturn message
	var detachedFailed bool
	streamed := false

	var eventsChan <-chan wsEvent
	if ws != nil {
		eventsChan = ws.eventsChan
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	done := false
	for !done {
		select {
		case ev, ok := <-eventsChan:
			if !ok {
				eventsChan = nil
				continue
			}
			switch ev.Type {
			case "terminal:output":
				if ev.SessionID == sessionID && (messageID == "" || ev.MessageID == messageID) {
					if args.output != "json" {
						fmt.Print(ev.Data)
						streamed = true
					}
					rawOutput.WriteString(ev.Data)
				}
			case "session:updated":
				if messageID == "" {
					var s session
					if err := json.Unmarshal(ev.Payload, &s); err == nil && s.ID == sessionID {
						if s.Status == "done" || s.Status == "error" {
							finalSession = s
							done = true
						}
					}
				}
			case "message:added":
				if messageID != "" {
					var m message
					if err := json.Unmarshal(ev.Payload, &m); err == nil && m.ParentID == messageID && m.Type == "detached-agent-return" {
						detachedReturn = m
						done = true
					}
				}
			}
		case <-ticker.C:
			if messageID != "" {
				messages, err := c.listMessages(sessionID)
				if err == nil {
					for _, candidate := range messages {
						if candidate.ID == messageID && candidate.Type == "detached-agent-run" {
							detachedRun = candidate
						}
						if candidate.Type == "detached-agent-return" && candidate.ParentID == messageID {
							detachedReturn = candidate
							done = true
							break
						}
					}
				}
			} else {
				s, err := c.getSession(sessionID)
				if err == nil {
					if ws == nil {
						fmt.Fprintf(os.Stderr, "[poll] status=%s\n", s.Status)
					}
					if s.Status == "done" || s.Status == "error" {
						finalSession = s
						done = true
					}
				}
			}
		case <-deadline.C:
			if messageID != "" {
				return finalSession, rawOutput.String(), false, fmt.Errorf("detached agent run %s did not finish within %s", messageID, timeout)
			}
			return finalSession, rawOutput.String(), false, fmt.Errorf("session %s did not finish within %s", sessionID, timeout)
		}
	}

	if ws != nil {
		_ = ws.Close()
	}

	if messageID != "" {
		if detachedRun.ID == "" {
			messages, err := c.listMessages(sessionID)
			if err == nil {
				for _, candidate := range messages {
					if candidate.ID == messageID && candidate.Type == "detached-agent-run" {
						detachedRun = candidate
						break
					}
				}
			}
		}
		detachedFailed = (detachedRun.ExitCode != nil && *detachedRun.ExitCode != 0) || detachedReturn.Role != "agent"
		if finalSession.ID == "" {
			finalSession, _ = c.getSession(sessionID)
		}
		if rawOutput.Len() == 0 || !streamed {
			log, err := c.getSessionLog(sessionID, detachedRun.ID)
			if err == nil && log != "" {
				rawOutput.Reset()
				rawOutput.WriteString(log)
			}
		}
	} else {
		if finalSession.ID == "" {
			finalSession, _ = c.getSession(sessionID)
		}
		if rawOutput.Len() == 0 || !streamed || args.output == "json" {
			log, err := c.rawOutput(sessionID)
			if err == nil && log != "" {
				rawOutput.Reset()
				rawOutput.WriteString(log)
			}
		}
	}

	if args.output != "json" && !streamed {
		fmt.Print(rawOutput.String())
	}

	return finalSession, rawOutput.String(), detachedFailed, nil
}
