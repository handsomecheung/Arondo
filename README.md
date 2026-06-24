# Arondo

Arondo is a mobile-first developer workspace that delegates coding tasks to AI agents and monitors executions across multiple machines. It follows a **Frontend + Server + Controller** architecture where lightweight Go-based Controllers are installed on development machines and the central Server coordinates all operations.

## Architecture

```
Browser (Next.js UI)  <--ws-->  Server (Next.js)  <--ws-->  Controller A (Go, machine-1)
                                                  <--ws-->  Controller B (Go, machine-2)
```

- **Controller** (`controller/`): A Go binary that connects to the Server via WebSocket. Executes commands, manages PTY sessions, runs git/filesystem operations. Minimal config — just a server URL and optional name.
- **Server**: Routes operations to Controllers. Manages all persistent state (sessions, projects, messages, logs). Serves the frontend.
- **Frontend**: Single-page React UI with controller selection, file browsing, chat, terminal modals, and task queue.

All execution goes through a Controller — there is no local fallback on the server.

## Features

- **Multi-Machine Controllers**: Install Go controllers on any development machine. The UI lets you pick which controller runs each session.
- **Session-Based Workspaces**: Each task is encapsulated inside a self-contained session under `data/sessions/[sessionId]/`, tracking history, settings, and outputs.
- **Granular Execution Logging**: Outputs for every CLI command execution are logged separately under `data/sessions/[sessionId]/logs/[messageId].log`.
- **Multiple AI Agents Support**: Supports **Gemini CLI** and **Antigravity CLI (agy)** for code generation tasks.
- **Interactive Terminal (PTY)**: Both agent and script execution run in a full pseudo-terminal via Go's `creack/pty`, rendered in the browser with `xterm.js`. Supports interactive stdin, ANSI colors, and cursor control. PTY ensures reliable process cleanup on controller exit (SIGHUP).
- **Concurrent Script Execution**: Allows running multiple scripts simultaneously within a single session. The user can continue chatting while background scripts are running.
- **Remote File Browsing**: Browse directories on any connected controller directly from the UI when selecting a project path.
- **Integrated Diff Viewer (diff2html)**: View visual code changes directly from the browser.
- **Task Queue & Live Tracking**: Active task queue in the header with PID tracking and live log inspection. Clicking a task opens its dedicated console log modal. Each task can be killed from the queue.
- **Task Persistence**: Active task contexts are persisted to disk (`data/active-tasks.json`) and restored on server restart. Controller IDs are stable across reconnections.
- **Mobile-Friendly UI**: Designed with collapsible panels, modal logs, responsive menus, and touch-friendly actions.
- **Project Management**: Scopes and tracks sessions within resolved repository paths. Supports custom project scripts and AI auto-script discovery.

## Getting Started

### 1. Install dependencies and start the server

```bash
npm install
npm run dev
```

### 2. Build and start a controller

```bash
cd controller
go build -o arondo-controller .
./arondo-controller --server ws://localhost:3251/controller --name my-dev-machine
```

Or use the convenience script:

```bash
./scripts/run.dev.controller.sh
```

### 3. Open the UI

Open [http://localhost:3251](http://localhost:3251) in your browser. Select the connected controller, choose a project directory, and start a session.

## Configuration & Environment Variables

- `GITHUB_TOKEN` – (Optional) Personal access token used to automatically create/submit PRs from the browser.
- `PORT` – (Optional) Server port. Defaults to `3251` in development, `3250` in production.

## Controller CLI

```
arondo-controller [flags]

Flags:
  --server string   Server WebSocket URL (default "ws://localhost:3251/controller")
  --name string     Controller display name (default: hostname)
```

The controller auto-reconnects with exponential backoff if the server connection drops.
