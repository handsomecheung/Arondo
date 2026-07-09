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
  handler_git.go        # git.status, git.diff
  handler_pty.go        # pty.input (write to PTY), pty.resize
  pty.go                # TaskManager: spawn processes with PTY, scrollback buffer, auto-cleanup on exit
app/
  page.tsx              # Main UI (runner selector, chat, status tracking, terminal modals, 3-dot dropdown)
  login/
    page.tsx            # Login UI page
  runners/
    page.tsx            # Standalone page for monitoring and deleting runners, and viewing quota details
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
        route.ts        # DELETE: delete session (moves to ~/.arondo/deleted-sessions/)
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
          route.ts        # POST: re-run the agent from scratch for a session (isResume: false)
    projects/
      route.ts          # GET: list all projects
      [id]/
        scripts/
          route.ts      # GET/POST/DELETE: manage project scripts
        auto-scripts/
          route.ts      # GET/POST: AI auto-script analysis
        run-script/
          route.ts      # POST: run a global project script via runner PTY
        restart-script/
          route.ts      # POST: restart a global project script task via exec.restart
    agent-commands/
      route.ts          # GET/POST/DELETE: manage custom agent slash commands
    agents/
      info/
        route.ts        # GET: fetch quota status for agents on all runners
    tasks/
      route.ts        # GET: list all tasks (active + retained)
      kill/
        route.ts        # POST: kill a running task by sessionId + messageId
    scheduled-tasks/
      route.ts          # GET: list scheduled tasks; POST: create fixed-time project script task
      [id]/
        route.ts        # DELETE: cancel/delete a scheduled task
    messages/route.ts   # GET: list messages for a session
    fs/route.ts         # GET: browse directories on a runner
    fs/infos/route.ts   # POST: batch check path existence and git diff status on the runner (used for markdown file link verification and inline diff triggering)
    auth/
      client-tokens/
        route.ts        # GET/POST/DELETE: manage client access tokens (admin role only)
      runner-tokens/
        route.ts        # GET/POST/DELETE: manage per-runner access tokens (admin role only)
      verify/
        route.ts        # POST: verify token validity
components/
  Terminal.tsx          # xterm.js terminal component (live WS mode + history replay mode)
  ShellTerminal.tsx     # Interactive shell terminal component (spawns server-side PTY via WebSocket)
  UserAgentCommandCard.tsx # Exec card representing a user-initiated agent slash command in the timeline
  ClientInit.tsx        # Performs client-side session token checking and login redirects
  ScheduleTaskModal.tsx # Modal to schedule project-scoped scripts at a future fixed time
lib/
  auth.ts               # Core authentication library (token verification, UUID lookup, token generation/migration)
  config.ts             # Configuration helpers, resolves data directory (defaults to ~/.arondo)
  store.ts              # File-based JSON storage (sessions, messages, logs, projects, scripts)
  agentCommands.ts      # Merges built-in and user-defined agent slash commands, resolves matches
  remarkFileLinks.ts    # Custom remark plugin to scan, verify, and linkify file paths inside markdown output
  event-bus.ts          # In-memory pub/sub (singleton on `process` for cross-context sharing)
  runner-manager.ts     # Manages runner connections, task routing, and task persistence
  runner-server.ts      # WebSocket handler for /runner endpoint (registration, heartbeat)
  ws-server.ts          # WebSocket handler for /ws endpoint: event bus broadcast + PTY I/O + shell PTY bridging
  scheduler.ts          # Scheduler engine for managing at, afterSession, and quotaAvailable tasks
  project-actions.ts    # Extracted action helpers for executing project-scoped scripts
  session-actions.ts    # Extracted action helpers for processing session messages and running agents
  agents/
    base.ts             # Abstract BaseAgent interface
    antigravity.ts      # Antigravity CLI (agy) adapter
    claude.ts           # Claude Code CLI adapter (supports --session-id and --resume for session continuity)
    index.ts            # AgentFactory (add new agents here)
scripts/
  run.server.sh         # Start the Next.js dev server
  run.runner1.sh        # Start Go runner 1 in dev mode (connects to localhost:3251)
  run.runner2.sh        # Start Go runner 2 in dev mode (connects to localhost:3251)
tests/                  # Playwright integration tests
  global-setup.ts       # Test environment initialization (builds Go runner, writes dummy tokens)
  global-teardown.ts    # Cleanup of temporary config and build artifacts
  server/               # Test suites for Server API endpoints
    auth.spec.ts        # RBAC and token validation tests
    runners.spec.ts     # Runner registration and authorization management
    global-rules.spec.ts # Reading and writing global agent rules
    sessions.spec.ts    # Session lifecycle (create, update, delete) integration
    server.spec.ts      # Health check and basic connectivity tests
  runner/               # Test suites for Go Runner handler capabilities
    fs.spec.ts          # File browsing and read capability tests
    git.spec.ts         # Git status and visual diff generation tests
    exec.spec.ts        # PTY script execution and lifecycle tracking
    runner.spec.ts      # Runner connection and handshake tests
~/.arondo/              # Runtime configuration & data directory (overridden by ARONDO_CONFIG_DIR)
  tokens.json           # Persisted multi-user access tokens (admin and user roles)
  agent-commands.json   # Persisted custom agent slash commands
  global-rules.md       # Global agent rules written from Settings
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
      logs/
        [taskId].log    # Project-scoped execution output logs
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
| `fs.read` | S→R request | Read file content |
| `fs.infos` | S→R request | Batch check path existence and git diff status |
| `git.status` | S→R request | Run `git status --porcelain` |
| `git.diff` | S→R request | Run `git diff HEAD` |
| `rules.sync` | S→R request | Write global agent rules block into `~/.gemini/GEMINI.md` and `~/.claude/CLAUDE.md` |
| `rules.remove` | S→R request | Strip the previously synced rules block from `~/.gemini/GEMINI.md` and `~/.claude/CLAUDE.md` |

## Runner Manager

`lib/runner-manager.ts` is the central coordinator. Key responsibilities:

- **Connection management**: Tracks connected runners (including IP address). Runner IDs are stable across reconnections (derived from `name@hostname`). `RunnerInfo.lastSeenAt` is stamped on both connect and disconnect.
- **Task routing**: Maps `taskId` → `TaskContext` (sessionId, messageId, runnerId, type, pid, completedAt, exitCode, stoppedByUser). Maps `sessionId:messageId` → `taskId` for PTY input routing.
- **Task persistence & retention**: Active task contexts are persisted by saving execution metadata directly to `messages.json` (for both sessions and projects). Completed tasks are retained for 3 days (`TASK_RETENTION_MS`), then purged on startup. On server restart, active tasks are restored and re-associated to the reconnecting runner.
- **Task cleanup**: `removeTasksForSession()` cleans up tasks when a session is deleted. `getAllTasks()` returns all tasks (active + retained). `purgeExpiredTasks()` removes completed tasks older than 3 days.
- **Runner discovery**: `getAllKnownRunners()` returns both connected runners and disconnected runners persisted on disk, used by the `/api/runners` route.
- **Task restart**: `restartTask()` sends `exec.restart` to the runner, killing the current process and re-spawning it with a new command within the same task slot.
- **Runner resolution**: `resolveRunnerId()` falls back to any connected runner when a session's stored runnerId is stale.
- **Global rules sync toggle**: `updateRunnerSyncGlobalRules()` persists a per-runner `syncGlobalRules` flag (`RunnerInfo.syncGlobalRules`, cached in `cachedSyncGlobalRules`, default `true`). Enabling it re-syncs rules via `syncGlobalRulesToRunner()`; disabling it calls `removeGlobalRulesFromRunner()` (sends `rules.remove`) to strip the previously written block from the runner's `GEMINI.md`/`CLAUDE.md`. `syncGlobalRulesToRunner()` is a no-op when the flag is `false`.
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

- **Runner Connection Stability (Heartbeat & Dead Link Detection)**: The Go runner client (`runner/client.go`) maintains a persistent connection with the server via periodic heartbeats. It detects dead connections using WebSocket ping/pong and a read deadline, automatically initiating reconnection with exponential backoff if the connection is lost.

**Browser WebSocket protocol (`/ws`):**
- Server → Client: `session:updated`, `message:added`, `session:deleted`, `terminal:output`, `terminal:exit`
- Client → Server: `terminal:input`, `terminal:resize`, `terminal:attach`
- Shell PTY (remote runner-side terminals managed via RunnerManager):
  - Client → Server: `shell:spawn` (includes `runnerId`, `sessionId`, `cwd`, etc.), `shell:input`, `shell:resize`, `shell:kill`
  - Server → Client: `shell:spawned`, `shell:output` (includes `runnerId`), `shell:exit` (includes `runnerId`)

**Cross-context singleton pattern:** The event bus and runner manager use `process` (not `global`) as the singleton carrier. This is required because `server.ts` runs via `tsx` while API routes run via Next.js Turbopack — they share the same `process` object but have separate `global` scopes.

## Multi-User Token-Based Authentication

The application enforces token-based authentication on all API routes and WebSocket connections to restrict access.

- **Tokens Registry (`tokens.json`)**: Stored in `~/.arondo/tokens.json` with the following structure:
  ```json
  {
    "clients": [
      {
        "token": "32-character-hex-string",
        "uuid": "canonical-uuid-string",
        "name": "User Name",
        "type": "admin"
      }
    ],
    "runners": [
      {
        "id": "token-id",
        "token": "32-character-hex-string",
        "name": "Runner Token Name",
        "createdAt": 1720000000000,
        "lastUsedAt": 1720000100000,
        "boundRunnerId": "runner-name@hostname"
      }
    ]
  }
  ```
- **Automatic Initialization**: On server startup, `initializeAuth()` in `lib/auth.ts` verifies if at least one token of type `admin` exists in `clients`. If not, it automatically generates a 32-character hexadecimal token, writes it to `tokens.json`, and outputs it to the server console.
- **Runner Connection Authentication (per-runner tokens)**:
  - Each runner authenticates with its own individually generated token, created and managed by an admin in Settings (Runner Tokens section) via `/api/auth/runner-tokens`, stored alongside client tokens under `runners` in `tokens.json`.
  - The token is sent only via the `x-runner-token` header (no longer accepted as a URL query param) and compared using a constant-time check (`timingSafeEqualStrings()` in `lib/auth.ts`).
  - A runner token **locks to the first runner identity** (`name@hostname`) that successfully registers with it (`boundRunnerId`), so a leaked token can't be replayed to impersonate a different, already-registered runner. Revoking a token disconnects its bound runner immediately.
  - The runner client can configure its token via the `--token` CLI flag or the `ARONDO_RUNNER_TOKEN` environment variable. Invalid or missing tokens result in a `401 Unauthorized` connection rejection.
  - Registration is asynchronous; messages arriving before the registration ack (e.g. the `task.status` event sent immediately after registering) are queued on the runner client and replayed once registration completes, avoiding a race where they'd be rejected as out-of-order.
- **Roles & Permissions**:
  - `admin`: Has unrestricted access to all runners, settings, custom agent commands, global rules, and user token management (generating, renaming, deleting user tokens).
  - `user`: Restricted role. Can only access sessions, projects, and runners that they are explicitly allowed to access.
- **Granular Access Control**:
  - Admins can configure runner-specific access control lists in the Settings dashboard. Each runner maintains an `allowedUserTokenUuids` list containing UUIDs of authorized user tokens.
  - The API router verifies permissions via `verifyRunnerPermission()`, `verifySessionPermission()`, and `verifyProjectPermission()` in `lib/auth.ts` using the client's token.
- **Secure WebSocket Authentication**:
  - To prevent exposing sensitive authentication tokens in query strings or server reverse-proxy logs, the browser client passes the token inside the standard `Sec-WebSocket-Protocol` subprotocol header (`arondo-token`) during the handshake.
  - The WebSocket server on `/ws` parses this subprotocol, extracts the token, and validates it before accepting the connection.

## Core Logging & Session Lifecycle Features
- **Message-specific execution logs**: Every agent or script execution creates a specific system message (e.g. `⚙️ Executing command...`). The resulting terminal outputs are streamed via the runner and stored in `~/.arondo/sessions/[sessionId]/logs/[systemMsgId].log`.
- **Interactive Terminal (PTY) & Mobile Keyboard Bar**: Script execution uses Go's `creack/pty` on the runner for full pseudo-terminal support (stdin, ANSI colors, cursor control). The frontend renders output via `xterm.js` (`components/Terminal.tsx`) in two modes: live (WebSocket-connected for running scripts, with historical log pre-loaded) and history (loads saved log data for completed scripts). It includes a mobile-specific special-keys bar (`components/TerminalKeyboardBar.tsx`) containing ESC/TAB/CTRL/ALT, arrow keys, and an FN layer (F1-F12), dynamically positioning itself above the mobile software keyboard to prevent obstruction.
- **Task Queue & Log Popup**: Tasks are tracked in a global header queue grouped by session, with session names always visible. Completed tasks are retained for 3 days. Clicking any task switches to its session and opens the log modal. Each running task has a kill button that sends SIGTERM via the runner. In the Tasks dashboard, users can toggle to display only non-completed tasks (active/running/stopped) and view execution logs inline.
- **User-stopped vs Failed distinction**: When a task is killed via the UI, `TaskContext.stoppedByUser` is set, producing a 🛑 "Stopped by user" completion message and `errorMessage` instead of an ❌ error. The terminal shows a “─── stopped by user ───” separator.
- **Dedicated Execution Cards, Rich Markdown & Inline Logs**: Unified `ExecCard` is split into `ScriptExecCard` (using `xterm.js` for interactive output, and supporting inline log streaming for quick-run commands) and `AgentExecCard` (rendering outputs in Markdown with syntax highlighting and clickable file/URL links). Clicking verified file paths opens them in the Remote File Browser. If a file has git modifications, a diff button is displayed next to the path to trigger an inline visual diff viewer modal. Card rendering performance is optimized by caching generated HTML to the backend on the first render. Users can toggle between Markdown and raw text views.
- **Restart/Retry actions**: `ScriptExecCard` shows a Restart button for script tasks (calls `restart-script` API → `exec.restart` on the runner) and `AgentExecCard` shows a Retry button for failed agent tasks (calls `rerun-agent` API). The terminal/view shows a “─── restarting ───” separator inline in the existing log.
- **Slash commands & Quick Exec Triggers**: Slash commands are config-driven and customizable (stored in `~/.arondo/agent-commands.json`). Custom slash commands display as blue `UserAgentCommandCard` nodes in the session timeline and track both the raw command and resolved prompt separately. Additionally, users can use `!` in the chat input to execute project-scoped scripts or arbitrary shell commands inline, with execution logs streamed directly within the card.
- **Tab Completion & Keyboard UX**: Chat input supports Tab completion to cycle through slash commands. Send messages via `Enter`, and insert a newline via `Ctrl+Enter` / `Meta+Enter`.
- **Session Navigation & Shell Terminal**: The three-dot dropdown in a session includes an "Open Terminal" option to open a `ShellTerminal` modal, and a "Go to Project" button to navigate back to the parent project interface.
- **Real-time Streaming**: Both agent and script output stream via WebSocket `terminal:output` (base64-encoded PTY data), forwarded through the event bus. The frontend renders script logs via xterm.js and agent logs via the plain wrapped text view.
- **Concurrency**: Multiple background scripts can run concurrently in a single session. The chat prompt stays active during execution.
- **Task Persistence**: Active task contexts survive server restarts by restoring metadata from session and project `messages.json`. Both active tasks and completed tasks within the 3-day retention period are restored. On runner reconnect, the `task.status` event reconciles running vs exited tasks.
- **Runner Disconnect Handling**: When a runner disconnects, orphaned tasks are automatically failed with exit code -1, updating session status and notifying the UI.
- **Agent Session Continuity (Session Resume)**: Retains conversation context for AI agents across different runs.
  - **Claude Code**: Supports `--session-id` (bound to the session) and `--resume` flags for native session continuity.
  - **Antigravity CLI (agy)**: On task exit, the Go runner scans its local logs via process ID (`detectAgyConvIdByPid`) to extract the generated conversation UUID. This UUID is passed back in the `exec.exit` event and saved by the server. Subsequent runs of `agy` within the same session will automatically pass `--conversation <uuid>` to resume the session.
- **Global Agent Rules Sync**: Settings screen allows specifying global agent rules. These are stored in `~/.arondo/global-rules.md` and automatically synced to `~/.gemini/GEMINI.md` and `~/.claude/CLAUDE.md` on runners upon connection. Each runner has a per-runner sync toggle (checked by default for new runners) in Settings; unchecking it stops future syncs to that runner and removes the previously synced block via a `rules.remove` runner method (`runner/handler_rules.go`).
- **AI Agent Quota Monitoring**: Runners collect agent quota usage from Claude and Antigravity via tmux pane capture, which is saved locally under `~/.arondo/agents/` on the server and displayed with progress bars in the Runners dashboard.
- **Secure Prompt Passing**: Instead of command line arguments, prompts are passed to agents using temporary files on the runner. The file path is stored in the `ARONDO_PROMPT_FILE` environment variable (and resolved using shell redirection `$(< "$ARONDO_PROMPT_FILE")`), which mitigates command length constraints and process command argument exposure. The UI "Show Prompt" panel displays the real resolved prompt instead of the original raw inputs.
- **AI Agent Auto-Selection (Auto Mode)**: Automatically selects the best agent and model based on hourly and weekly quota availability retrieved from the runner. New chat sessions default to using the Auto agent mode.
  - **Choices**:
    - **Choice A**: Antigravity (`agy`) + `Gemini 3.5 Flash (Medium)` (Quota: `GeminiHourRemain`, `GeminiWeeklyRemain`)
    - **Choice B**: Antigravity (`agy`) + `Claude Sonnet 4.6 (Thinking)` (Quota: `OtherHourRemain`, `OtherWeeklyRemain`)
    - **Choice C**: Claude (`claude`) + default `Sonnet` (Quota: `HourRemain`, `WeekRemain`)
  - **Selection Algorithm**:
    1. **Hourly Quota Filtering**: If any choice's remaining hourly ratio (`HourRemain`, `GeminiHourRemain`, `OtherHourRemain`) is below `0.15`, it is appended to the end of the candidate list and excluded from step 2. Exception: If *all* choices are below `0.15`, they are all kept for step 2 comparison.
    2. **Weekly Time-Remaining Score**: For active choices, calculate `score = WeekRemain - WeekTimeRemain`, where `WeekTimeRemain = max(0, min(1, (ResetsAt - Now) / 604800))`. This compares the remaining quota ratio against the remaining time ratio of the quota week.
    3. **Final Order**: Sort active choices by score in descending order and prepend them to the low-quota choices. The first candidate is selected and spawned with the mapped `--model` parameter.
- **Manual Agent Switching**: Allows switching the active agent (Antigravity CLI, Claude Code, or Auto) of an existing session via a dropdown selector in the session header when no command is currently running.
- **Inline Runner Details**: The Runners dashboard displays the runner details panel inline directly below the selected runner card for better usability.
- **Disconnected Runner Deletion**: Allows deleting registered but disconnected runners from the Runners dashboard, which purges their corresponding metadata and directories.
- **Automated Data Lifecycle**: Automatically purges orphan sessions or projects on load if their parent references (e.g. project or runner) no longer exist.
- **@ Path Selector Modal**: Typing `@` in the chat textarea opens a file and directory selector modal to easily select a path and insert its relative path into the input field. Navigation ("Go Up") is allowed past the project root, with an "(outside project)" label shown once the current path leaves the project directory.
- **File Browser with Syntax Highlighting**: A Remote File Browser can be opened from the session's three-dot menu, featuring file previews (up to 512KB) with code syntax highlighting and a word wrap toggle option.
- **Scheduled Tasks, Auto-Queue Follow-ups & Quota Retry**: Users can schedule project-scoped scripts to run at a future fixed time. If the agent is currently running when a user sends a follow-up, the message is automatically queued as a scheduled task (`afterSession` trigger) and executed sequentially once the active task finishes. If the agent terminates due to quota limits, a `quotaAvailable` task is scheduled to automatically retry using the last user prompt once the quota becomes available.
- **Diff View File Collapse/Expand**: The visual HTML diff viewer supports collapsing and expanding individual changed files dynamically, enhancing diff readability.

## Project & Custom Scripts Management
- **Project Scoping**: Sessions are mapped to projects by repository path + runnerId. Projects store metadata at `~/.arondo/projects/[projectId]/project.json`.
- **Custom Project Scripts**: Commands (build, test, deploy) scoped to repositories, stored under `~/.arondo/projects/[projectId]/settings/scripts.json`. Can be executed globally (sessionless, directly from the project panel) or inside a session.
- **AI Auto-Script Discovery**: Background process using `agy` to auto-detect and register project scripts. This process is executed remotely on the selected runner using the `exec.agent` API, ensuring no local execution happens on the server.

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
