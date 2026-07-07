package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// pongWait must exceed the server's heartbeat ping interval (30s, see
	// lib/runner-server.ts HEARTBEAT_INTERVAL) with margin for jitter/latency.
	pongWait = 90 * time.Second
	// pingPeriod is how often the client itself pings the server. Sending our
	// own pings (in addition to replying to the server's) means a broken
	// write side is detected immediately via a WriteControl error, instead of
	// waiting up to pongWait for the read side to time out.
	pingPeriod = 25 * time.Second
	writeWait  = 10 * time.Second
)

type Client struct {
	serverURL string
	name      string
	token     string
	conn      *websocket.Conn
	handler   *Handler
	sendMu    sync.Mutex
	done      chan struct{}
}

func NewClient(serverURL, name, token string) *Client {
	c := &Client{
		serverURL: serverURL,
		name:      name,
		token:     token,
		done:      make(chan struct{}),
	}
	c.handler = NewHandler(c)
	return c
}

func (c *Client) Run() {
	delay := time.Second
	maxDelay := 30 * time.Second

	for {
		err := c.connect()
		if err != nil {
			log.Printf("connection failed: %v", err)
		} else {
			delay = time.Second
			c.readLoop()
			log.Println("connection closed")
		}

		select {
		case <-c.done:
			return
		default:
		}

		log.Printf("reconnecting in %v...", delay)
		time.Sleep(delay)
		delay = delay * 2
		if delay > maxDelay {
			delay = maxDelay
		}
	}
}

func (c *Client) Stop() {
	close(c.done)
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *Client) connect() error {
	log.Printf("connecting to %s", c.serverURL)

	dialURL := c.serverURL
	if c.token != "" {
		u, err := url.Parse(c.serverURL)
		if err == nil {
			q := u.Query()
			q.Set("token", c.token)
			u.RawQuery = q.Encode()
			dialURL = u.String()
		}
	}

	conn, _, err := websocket.DefaultDialer.Dial(dialURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	c.conn = conn
	log.Println("connected")

	// A connection can go silently dead (e.g. after the host sleeps/wakes or
	// switches networks) without the TCP stack ever surfacing an error, which
	// would otherwise leave readLoop blocked in ReadMessage forever and the
	// client stuck thinking it's still connected. Track liveness via WebSocket
	// ping/pong control frames and a read deadline so a dead connection gets
	// detected and reconnected instead of hanging indefinitely.
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPingHandler(func(appData string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		err := conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(writeWait))
		if err == websocket.ErrCloseSent {
			return nil
		}
		return err
	})
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	if err := c.sendRegister(); err != nil {
		conn.Close()
		return fmt.Errorf("register: %w", err)
	}

	if err := c.sendTaskStatus(); err != nil {
		log.Printf("warning: failed to send task status: %v", err)
	}

	go c.heartbeatLoop()

	return nil
}

func (c *Client) sendRegister() error {
	hostname, _ := os.Hostname()

	payload := map[string]any{
		"name":     c.name,
		"version":  "0.2.3",
		"hostname": hostname,
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"capabilities": []string{
			"exec.agent", "exec.script", "exec.cancel",
			"pty.input", "pty.resize",
			"fs.list",
			"git.status", "git.diff",
		},
		// agents list is empty on register; the server will send queryAgents
		// in the connected event, and we respond with agent.status.
		"agents": []string{},
	}
	msg, err := NewEvent("register", payload)
	if err != nil {
		return err
	}
	return c.Send(msg)
}

// sendAgentStatus checks which binaries from queryAgents exist on PATH
// and sends an agent.status event back to the server.
func (c *Client) sendAgentStatus(queryAgents []string) error {
	var available []string
	for _, cmd := range queryAgents {
		if _, err := exec.LookPath(cmd); err == nil {
			available = append(available, cmd)
		}
	}
	if available == nil {
		available = []string{}
	}
	msg, err := NewEvent("agent.status", map[string]any{"agents": available})
	if err != nil {
		return err
	}
	return c.Send(msg)
}

func (c *Client) sendTaskStatus() error {
	tasks := c.handler.taskManager.ListTasks()

	type taskStatus struct {
		TaskID   string `json:"taskId"`
		State    string `json:"state"`
		ExitCode *int   `json:"exitCode,omitempty"`
	}

	// Always report, even when empty: the server relies on this event (including
	// an empty task list) to detect tasks it still thinks are running but that
	// this runner has lost track of (e.g. after a runner process restart).
	statuses := make([]taskStatus, 0, len(tasks))
	for _, t := range tasks {
		ts := taskStatus{TaskID: t.ID}
		if t.Done {
			ts.State = "exited"
			ts.ExitCode = &t.ExitCode
		} else {
			ts.State = "running"
		}
		statuses = append(statuses, ts)
	}

	msg, err := NewEvent("task.status", map[string]any{"tasks": statuses})
	if err != nil {
		return err
	}
	return c.Send(msg)
}

func (c *Client) Send(msg *Message) error {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) readLoop() {
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				log.Printf("read error: connection timed out waiting for server ping (%v)", err)
			} else if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("read error: %v", err)
			}
			return
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("invalid message: %v", err)
			continue
		}

		c.handler.HandleMessage(&msg)
	}
}

func (c *Client) heartbeatLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.sendMu.Lock()
			err := c.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeWait))
			c.sendMu.Unlock()
			if err != nil {
				// Write side is broken; close so readLoop unblocks and Run() reconnects.
				c.conn.Close()
				return
			}
		case <-c.done:
			return
		}
	}
}
