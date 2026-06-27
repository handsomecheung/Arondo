# Arondo – Project Context

## Coding Rules

1. **Mobile-first**: The core purpose of this project is to enable iterating on projects anytime, anywhere, unconstrained by a specific machine. Mobile usability is always the top priority.

2. **Minimal comments**: Only write comments when they carry information that the code itself cannot express. A good comment explains *why* or provides domain knowledge not visible in the code:
   ```python
   # Type 1 is A record, Type 28 is AAAA record
   if answer.get("type") in (1, 28):
   ```
   A comment that merely restates what the code does is noise and must be omitted:
   ```go
   // run the command with bash   ← redundant, delete it
   cmd := exec.Command("bash", "-c", command)
   ```

3. **1000-line file limit**: No file should exceed 1000 lines. If a file grows beyond that, refactor it — extract shared logic into a common library or split by responsibility.

4. **No defensive exception handling**: Do not speculatively catch exceptions just because a function *might* throw. Let errors surface naturally and fix them when they actually occur.

5. **No dead code**: If you find unused dead code, delete it immediately. Do not keep it.

---

Before starting work, ensure you have read the `README.md` in current directory to understand the project's background, objectives, and overall architecture. If a `README.md` exists in your current working directory (the project subdirectory you are modifying), refer to it for specific instructions and project details.

## Overview
Arondo is a Next.js full-stack application that enables mobile-first software development
by delegating coding tasks to AI agents across multiple machines via Go-based Runners.

## Architecture

```
Browser (Next.js UI)  <--ws /ws-->  Server (Next.js + tsx)  <--ws /runner-->  Runner (Go binary)
```

- **Runner** (`runner/`): Go binary connecting to the server via WebSocket. Handles all execution: agent commands, PTY scripts, filesystem browsing, git operations. Stateless — all persistent state lives on the server.
- **Server**: Coordinates Runners, routes operations, manages state. Two WebSocket endpoints: `/ws` (browser) and `/runner` (runners).
- **Frontend**: React SPA with runner selection, remote file browsing, chat, terminal modals, and task queue.

All execution goes through a Runner — there is no local fallback on the server.

## Key Architecture

```
server.ts               # Custom HTTP server wrapping Next.js with WebSocket upgrade at /ws and /runner
runner/                  # Go runner binary
  main.go               # Entry point: --server and --name flags, signal handling
  client.go             # WebSocket client: connect, reconnect (exponential backoff), heartbeat
  protocol.go           # Message envelope struct (id, type, method, payload), constructors
  handler.go            # Request dispatcher by method string, response helpers
  handler_exec.go       # exec.agent, exec.script, exec.cancel, exec.restart (all PTY-based)
  handler_fs.go         # fs.list: directory listing
  handler_git.go        # git.status, git.diff, git.pr.create
  handler_pty.go        # pty.input (write to PTY), pty.resize
  pty.go                # TaskManager: spawn processes with PTY, scrollback buffer, auto-cleanup on exit
app/
  page.tsx              # Main UI (runner selector, chat, status tracking, terminal modals, 3-dot dropdown)
  tasks/
    page.tsx            # Tasks management page (session list, shell terminal, status monitoring)
  layout.tsx            # Root layout
  globals.css           # Design system
  api/
    runners/
      route.ts          # GET: list all known runners (connected + disconnected, with lastSeenAt)
    sessions/
      route.ts          # POST: create session & run agent via runner; GET: list sessions
      [id]/
        route.ts        # DELETE: delete session (moves to data/deleted-sessions/)
        diff/
          route.ts      # GET: generate and serve visual HTML diff via runner + diff2html
        log/
          route.ts      # GET: fetch run log for specific messageId
        git-status/
          route.ts      # GET: check git changes via runner
        messages/
          route.ts      # POST: add user follow-up message & trigger agent via runner
        run-script/
          route.ts      # POST: run a project script via runner PTY
        restart-script/
          route.ts      # POST: restart a specific script task in-place via exec.restart
        rerun-agent/
          route.ts      # POST: re-run the agent from scratch for a session (isResume: false)
        pr/
          route.ts      # POST: trigger GitHub Pull Request creation via runner
    projects/
      route.ts          # GET: list all projects
      [id]/
        scripts/
          route.ts      # GET/POST/DELETE: manage project scripts
        auto-scripts/
          route.ts      # GET/POST: AI auto-script analysis
    tasks/
      route.ts        # GET: list all tasks (active + retained)
      kill/
        route.ts        # POST: kill a running task by sessionId + messageId
    messages/route.ts   # GET: list messages for a session
    fs/route.ts         # GET: browse directories on a runner
components/
  Terminal.tsx          # xterm.js terminal component (live WS mode + history replay mode)
  ShellTerminal.tsx     # Interactive shell terminal component (spawns server-side PTY via WebSocket)
lib/
  store.ts              # File-based JSON storage (sessions, messages, logs, projects, scripts)
  event-bus.ts          # In-memory pub/sub (singleton on `process` for cross-context sharing)
  pty-manager.ts        # Server-side PTY manager for local shell sessions (node-pty, scrollback buffer)
  runner-manager.ts     # Manages runner connections, task routing, and task persistence
  runner-server.ts      # WebSocket handler for /runner endpoint (registration, heartbeat)
  ws-server.ts          # WebSocket handler for /ws endpoint: event bus broadcast + PTY I/O + shell PTY bridging
  agents/
    base.ts             # Abstract BaseAgent interface
    antigravity.ts      # Antigravity CLI (agy) adapter
    claude.ts           # Claude Code CLI adapter (supports --session-id and --resume for session continuity)
    index.ts            # AgentFactory (add new agents here)
scripts/
  run.server.sh         # Start the Next.js dev server
  run.runner1.sh        # Start Go runner 1 in dev mode (connects to localhost:3251)
  run.runner2.sh        # Start Go runner 2 in dev mode (connects to localhost:3251)
data/                   # Runtime data (gitignored)
  active-tasks.json     # Persisted active task contexts (survives server restart)
  agy-sessions.json     # Map file matching Arondo sessionIds with agy conversation UUIDs
  sessions/
    [sessionId]/
      session.json      # Session metadata (status, prompt, agent, repoPath, runnerId)
      messages.json     # Message history within the session
      logs/
        [messageId].log # Execution output logs bound to specific system message ID
  projects/
    [projectId]/
      project.json      # Project metadata (id, repoPath, runnerId, createdAt, updatedAt)
      settings/
        scripts.json    # Configured custom scripts list for the project
  deleted-sessions/     # Soft-deleted sessions moved here upon deletion
```

## Runner Protocol

All messages use a JSON envelope: `{ id, type, method, payload }`.

**Message types:**
- `request` (Server → Runner): expects a `response` with the same `id`
- `response` (Runner → Server): correlates with a request by `id`
- `stream` (Runner → Server): continuous data (e.g., `exec.output`)
- `event` (Runner → Server): one-shot notifications (e.g., `exec.exit`, `register`, `task.status`)

**Methods:**
| Method | Direction | Description |
|---|---|---|
| `register` | R→S event | Runner registration on connect |
| `task.status` | R→S event | Report running/exited tasks (used on reconnect) |
| `exec.agent` | S→R request | Start agent command (PTY mode) |
| `exec.script` | S→R request | Start script (PTY mode) |
| `exec.cancel` | S→R request | Kill a running task (SIGTERM/SIGKILL) |
| `exec.restart` | S→R request | Kill current process and re-spawn with new command in the same task slot; shows ─── restarting ─── separator |
| `exec.output` | R→S stream | Stdout/stderr data (base64-encoded) |
| `exec.exit` | R→S event | Process exited with exit code |
| `pty.input` | S→R request | Write stdin data to PTY |
| `pty.resize` | S→R request | Resize PTY terminal |
| `fs.list` | S→R request | List directories at a path |
| `git.status` | S→R request | Run `git status --porcelain` |
| `git.diff` | S→R request | Run `git diff HEAD` |
| `git.pr.create` | S→R request | Push branch and create PR via `gh` |

## Runner Manager

`lib/runner-manager.ts` is the central coordinator. Key responsibilities:

- **Connection management**: Tracks connected runners (including IP address). Runner IDs are stable across reconnections (derived from `name@hostname`). `RunnerInfo.lastSeenAt` is stamped on both connect and disconnect.
- **Task routing**: Maps `taskId` → `TaskContext` (sessionId, messageId, runnerId, type, pid, completedAt, exitCode, stoppedByUser). Maps `sessionId:messageId` → `taskId` for PTY input routing.
- **Task persistence & retention**: All tasks (active + completed) are saved to `data/active-tasks.json`. Completed tasks are retained for 7 days (`TASK_RETENTION_MS`), then purged on startup. On server restart, tasks are restored and active ones re-associated to the reconnecting runner.
- **Task cleanup**: `removeTasksForSession()` cleans up tasks when a session is deleted. `getAllTasks()` returns all tasks (active + retained). `purgeExpiredTasks()` removes completed tasks older than 7 days.
- **Runner discovery**: `getAllKnownRunners()` returns both connected runners and disconnected runners persisted on disk, used by the `/api/runners` route.
- **Task restart**: `restartTask()` sends `exec.restart` to the runner, killing the current process and re-spawning it with a new command within the same task slot.
- **Runner resolution**: `resolveRunnerId()` falls back to any connected runner when a session's stored runnerId is stale.
- **Stream/event handling**: Routes `exec.output` streams to the correct session's log file and event bus. Handles `exec.exit` to update session status and add completion messages.
- **Disconnect cleanup**: Fails orphaned active tasks when a runner disconnects (skips already-completed tasks).

Uses the `process` singleton pattern (shared across tsx and Turbopack contexts).

## Adding a New Agent
1. Create `lib/agents/<name>.ts` implementing `BaseAgent`
2. Register it in `lib/agents/index.ts` AGENTS map

## Development
```bash
./scripts/run.server.sh      # Start server via tsx watch (dev: port 3251, prod: port 3250)
./scripts/run.runner1.sh     # Start runner 1 connecting to localhost:3251
./scripts/run.runner2.sh     # Start runner 2 connecting to localhost:3251
```

## Real-time Communication

Two WebSocket endpoints:
- `/ws` — Browser ↔ Server (UI events, terminal I/O)
- `/runner` — Runner ↔ Server (execution protocol)

**Browser WebSocket protocol (`/ws`):**
- Server → Client: `session:updated`, `message:added`, `session:deleted`, `terminal:output`, `terminal:exit`
- Client → Server: `terminal:input`, `terminal:resize`, `terminal:attach`
- Shell PTY (local server-side terminals via `lib/pty-manager.ts`):
  - Client → Server: `shell:spawn`, `shell:input`, `shell:resize`, `shell:kill`
  - Server → Client: `shell:spawned`, `shell:output`, `shell:exit`

**Cross-context singleton pattern:** The event bus and runner manager use `process` (not `global`) as the singleton carrier. This is required because `server.ts` runs via `tsx` while API routes run via Next.js Turbopack — they share the same `process` object but have separate `global` scopes.

## Core Logging & Session Lifecycle Features
- **Message-specific execution logs**: Every agent or script execution creates a specific system message (e.g. `⚙️ Executing command...`). The resulting terminal outputs are streamed via the runner and stored in `data/sessions/[sessionId]/logs/[systemMsgId].log`.
- **Interactive Terminal (PTY)**: Script execution uses Go's `creack/pty` on the runner for full pseudo-terminal support (stdin, ANSI colors, cursor control). The frontend renders output via `xterm.js` (`components/Terminal.tsx`) in two modes: live (WebSocket-connected for running scripts, with historical log pre-loaded) and history (loads saved log data for completed scripts).
- **Task Queue & Log Popup**: Tasks are tracked in a global header queue grouped by session, with session names always visible. Completed tasks are retained for 7 days. Clicking any task switches to its session and opens the log modal. Each running task has a kill button that sends SIGTERM via the runner.
- **User-stopped vs Failed distinction**: When a task is killed via the UI, `TaskContext.stoppedByUser` is set, producing a 🛑 "Stopped by user" completion message and `errorMessage` instead of an ❌ error. The terminal shows a “─── stopped by user ───” separator.
- **Restart/Retry actions**: ExecCard shows a Restart button for script tasks (calls `restart-script` API → `exec.restart` on the runner) and a Retry button for failed agent tasks (calls `rerun-agent` API). The terminal shows a “─── restarting ───” separator inline in the existing log.
- **Slash commands in chat**: `/new [name]` opens a new session with the same project/agent/runner. `/commit [message]` sends a commit instruction to the current agent session.
- **Open Terminal in session menu**: The three-dot dropdown in a session includes an "Open Terminal" option that opens a `ShellTerminal` modal for that session's runner.
- **Real-time Streaming**: Both agent and script output stream via WebSocket `terminal:output` (base64-encoded PTY data), forwarded through the event bus. The frontend renders all logs via the xterm.js Terminal component.
- **Concurrency**: Multiple background scripts can run concurrently in a single session. The chat prompt stays active during execution.
- **Task Persistence**: Active task contexts survive server restarts via `data/active-tasks.json`. On runner reconnect, the `task.status` event reconciles running vs exited tasks.
- **Runner Disconnect Handling**: When a runner disconnects, orphaned tasks are automatically failed with exit code -1, updating session status and notifying the UI.
- **Agent Session Continuity**: ClaudeCodeAgent supports `--session-id` (bind to a session) and `--resume` (resume an existing session) flags, enabling multi-turn conversations within the same agent session.

## Project & Custom Scripts Management
- **Project Scoping**: Sessions are mapped to projects by repository path + runnerId. Projects store metadata at `data/projects/[projectId]/project.json`.
- **Custom Project Scripts**: Commands (build, test, deploy) scoped to repositories, stored under `data/projects/[projectId]/settings/scripts.json`.
- **AI Auto-Script Discovery**: Background process using `agy` to auto-detect and register project scripts.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Arondo** (762 symbols, 1761 relationships, 63 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Arondo/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Arondo/clusters` | All functional areas |
| `gitnexus://repo/Arondo/processes` | All execution flows |
| `gitnexus://repo/Arondo/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
