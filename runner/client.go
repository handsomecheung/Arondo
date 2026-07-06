package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	serverURL string
	name      string
	conn      *websocket.Conn
	handler   *Handler
	sendMu    sync.Mutex
	done      chan struct{}
}

func NewClient(serverURL, name string) *Client {
	c := &Client{
		serverURL: serverURL,
		name:      name,
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
	conn, _, err := websocket.DefaultDialer.Dial(c.serverURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	c.conn = conn
	log.Println("connected")

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
		"version":  "0.2.2",
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
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
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
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			msg, _ := NewEvent("pong", map[string]any{})
			if err := c.Send(msg); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}
