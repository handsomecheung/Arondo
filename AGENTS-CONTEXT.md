# Itero – Project Context

Before starting work, ensure you have read the `README.md` in current directory to understand the project's background, objectives, and overall architecture. If a `README.md` exists in your current working directory (the project subdirectory you are modifying), refer to it for specific instructions and project details.

## Overview
Itero is a Next.js full-stack application that enables mobile-first software development
by delegating coding tasks to AI agents across multiple machines via Go-based Controllers.

## Architecture

```
Browser (Next.js UI)  <--ws /ws-->  Server (Next.js + tsx)  <--ws /controller-->  Controller (Go binary)
```

- **Controller** (`controller/`): Go binary connecting to the server via WebSocket. Handles all execution: agent commands, PTY scripts, filesystem browsing, git operations. Stateless — all persistent state lives on the server.
- **Server**: Coordinates Controllers, routes operations, manages state. Two WebSocket endpoints: `/ws` (browser) and `/controller` (controllers).
- **Frontend**: React SPA with controller selection, remote file browsing, chat, terminal modals, and task queue.

All execution goes through a Controller — there is no local fallback on the server.

## Key Architecture

```
server.ts               # Custom HTTP server wrapping Next.js with WebSocket upgrade at /ws and /controller
controller/             # Go controller binary
  main.go               # Entry point: --server and --name flags, signal handling
  client.go             # WebSocket client: connect, reconnect (exponential backoff), heartbeat
  protocol.go           # Message envelope struct (id, type, method, payload), constructors
  handler.go            # Request dispatcher by method string, response helpers
  handler_exec.go       # exec.agent, exec.script, exec.cancel (all PTY-based)
  handler_fs.go         # fs.list: directory listing
  handler_git.go        # git.status, git.diff, git.pr.create
  handler_pty.go        # pty.input (write to PTY), pty.resize
  pty.go                # TaskManager: spawn processes with PTY, scrollback buffer, auto-cleanup on exit
app/
  page.tsx              # Main UI (controller selector, chat, status tracking, terminal modals, 3-dot dropdown)
  layout.tsx            # Root layout
  globals.css           # Design system
  api/
    controllers/
      route.ts          # GET: list connected controllers
    sessions/
      route.ts          # POST: create session & run agent via controller; GET: list sessions
      [id]/
        route.ts        # DELETE: delete session (moves to data/deleted-sessions/)
        diff/
          route.ts      # GET: generate and serve visual HTML diff via controller + diff2html
        log/
          route.ts      # GET: fetch run log for specific messageId
        git-status/
          route.ts      # GET: check git changes via controller
        messages/
          route.ts      # POST: add user follow-up message & trigger agent via controller
        run-script/
          route.ts      # POST: run a project script via controller PTY
        pr/
          route.ts      # POST: trigger GitHub Pull Request creation via controller
    projects/
      route.ts          # GET: list all projects
      [id]/
        scripts/
          route.ts      # GET/POST/DELETE: manage project scripts
        auto-scripts/
          route.ts      # GET/POST: AI auto-script analysis
    tasks/
      kill/
        route.ts        # POST: kill a running task by sessionId + messageId
    messages/route.ts   # GET: list messages for a session
    fs/route.ts         # GET: browse directories on a controller
components/
  Terminal.tsx          # xterm.js terminal component (live WS mode + history replay mode)
lib/
  store.ts              # File-based JSON storage (sessions, messages, logs, projects, scripts)
  event-bus.ts          # In-memory pub/sub (singleton on `process` for cross-context sharing)
  controller-manager.ts # Manages controller connections, task routing, and task persistence
  controller-server.ts  # WebSocket handler for /controller endpoint (registration, heartbeat)
  ws-server.ts          # WebSocket handler for /ws endpoint: event bus broadcast + PTY I/O bridging
  agents/
    base.ts             # Abstract BaseAgent interface
    gemini.ts           # Gemini CLI adapter
    antigravity.ts      # Antigravity CLI (agy) adapter
    index.ts            # AgentFactory (add new agents here)
scripts/
  run.dev.server.sh     # Start the Next.js dev server
  run.dev.controller.sh # Start the Go controller in dev mode (connects to localhost:3251)
data/                   # Runtime data (gitignored)
  active-tasks.json     # Persisted active task contexts (survives server restart)
  agy-sessions.json     # Map file matching Itero sessionIds with agy conversation UUIDs
  sessions/
    [sessionId]/
      session.json      # Session metadata (status, prompt, agent, repoPath, controllerId)
      messages.json     # Message history within the session
      logs/
        [messageId].log # Execution output logs bound to specific system message ID
  projects/
    [projectId]/
      project.json      # Project metadata (id, repoPath, controllerId, createdAt, updatedAt)
      settings/
        scripts.json    # Configured custom scripts list for the project
  deleted-sessions/     # Soft-deleted sessions moved here upon deletion
```

## Controller Protocol

All messages use a JSON envelope: `{ id, type, method, payload }`.

**Message types:**
- `request` (Server → Controller): expects a `response` with the same `id`
- `response` (Controller → Server): correlates with a request by `id`
- `stream` (Controller → Server): continuous data (e.g., `exec.output`)
- `event` (Controller → Server): one-shot notifications (e.g., `exec.exit`, `register`, `task.status`)

**Methods:**
| Method | Direction | Description |
|---|---|---|
| `register` | C→S event | Controller registration on connect |
| `task.status` | C→S event | Report running/exited tasks (used on reconnect) |
| `exec.agent` | S→C request | Start agent command (PTY mode) |
| `exec.script` | S→C request | Start script (PTY mode) |
| `exec.cancel` | S→C request | Kill a running task (SIGTERM/SIGKILL) |
| `exec.output` | C→S stream | Stdout/stderr data (base64-encoded) |
| `exec.exit` | C→S event | Process exited with exit code |
| `pty.input` | S→C request | Write stdin data to PTY |
| `pty.resize` | S→C request | Resize PTY terminal |
| `fs.list` | S→C request | List directories at a path |
| `git.status` | S→C request | Run `git status --porcelain` |
| `git.diff` | S→C request | Run `git diff HEAD` |
| `git.pr.create` | S→C request | Push branch and create PR via `gh` |

## Controller Manager

`lib/controller-manager.ts` is the central coordinator. Key responsibilities:

- **Connection management**: Tracks connected controllers. Controller IDs are stable across reconnections (derived from `name@hostname`).
- **Task routing**: Maps `taskId` → `TaskContext` (sessionId, messageId, controllerId, type, pid). Maps `sessionId:messageId` → `taskId` for PTY input routing.
- **Task persistence**: Active tasks are saved to `data/active-tasks.json` on register/exit. On server restart, tasks are restored and re-associated to the reconnecting controller.
- **Controller resolution**: `resolveControllerId()` falls back to any connected controller when a session's stored controllerId is stale.
- **Stream/event handling**: Routes `exec.output` streams to the correct session's log file and event bus. Handles `exec.exit` to update session status and add completion messages.
- **Disconnect cleanup**: Fails orphaned tasks when a controller disconnects.

Uses the `process` singleton pattern (shared across tsx and Turbopack contexts).

## Adding a New Agent
1. Create `lib/agents/<name>.ts` implementing `BaseAgent`
2. Register it in `lib/agents/index.ts` AGENTS map

## Development
```bash
./scripts/run.dev.server.sh      # Start server via tsx watch (dev: port 3251, prod: port 3250)
./scripts/run.dev.controller.sh  # Start controller connecting to localhost:3251
```

## Real-time Communication

Two WebSocket endpoints:
- `/ws` — Browser ↔ Server (UI events, terminal I/O)
- `/controller` — Controller ↔ Server (execution protocol)

**Browser WebSocket protocol (`/ws`):**
- Server → Client: `session:updated`, `message:added`, `session:deleted`, `terminal:output`, `terminal:exit`
- Client → Server: `terminal:input`, `terminal:resize`, `terminal:attach`

**Cross-context singleton pattern:** The event bus and controller manager use `process` (not `global`) as the singleton carrier. This is required because `server.ts` runs via `tsx` while API routes run via Next.js Turbopack — they share the same `process` object but have separate `global` scopes.

## Core Logging & Session Lifecycle Features
- **Message-specific execution logs**: Every agent or script execution creates a specific system message (e.g. `⚙️ Executing command...`). The resulting terminal outputs are streamed via the controller and stored in `data/sessions/[sessionId]/logs/[systemMsgId].log`.
- **Interactive Terminal (PTY)**: Script execution uses Go's `creack/pty` on the controller for full pseudo-terminal support (stdin, ANSI colors, cursor control). The frontend renders output via `xterm.js` (`components/Terminal.tsx`) in two modes: live (WebSocket-connected for running scripts, with historical log pre-loaded) and history (loads saved log data for completed scripts).
- **Task Queue & Log Popup**: Active tasks are tracked in a global header queue with PID tracking. Clicking any running task switches to its session and opens the log modal. Each task has a kill button that sends SIGTERM via the controller.
- **Real-time Streaming**: Both agent and script output stream via WebSocket `terminal:output` (base64-encoded PTY data), forwarded through the event bus. The frontend renders all logs via the xterm.js Terminal component.
- **Concurrency**: Multiple background scripts can run concurrently in a single session. The chat prompt stays active during execution.
- **Task Persistence**: Active task contexts survive server restarts via `data/active-tasks.json`. On controller reconnect, the `task.status` event reconciles running vs exited tasks.
- **Controller Disconnect Handling**: When a controller disconnects, orphaned tasks are automatically failed with exit code -1, updating session status and notifying the UI.

## Project & Custom Scripts Management
- **Project Scoping**: Sessions are mapped to projects by repository path + controllerId. Projects store metadata at `data/projects/[projectId]/project.json`.
- **Custom Project Scripts**: Commands (build, test, deploy) scoped to repositories, stored under `data/projects/[projectId]/settings/scripts.json`.
- **AI Auto-Script Discovery**: Background process using `agy` to auto-detect and register project scripts.
