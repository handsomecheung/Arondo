# Arondo

Arondo is a mobile-first developer workspace that delegates coding tasks to AI agents and monitors executions across multiple machines. It follows a **Frontend + Server + Runner** architecture where lightweight Go-based Runners are installed on development machines and the central Server coordinates all operations.

## Architecture

```
Browser (Next.js UI)  <--ws-->  Server (Next.js)  <--ws-->  Runner A (Go, machine-1)
                                                  <--ws-->  Runner B (Go, machine-2)
```

- **Runner** (`runner/`): A Go binary that connects to the Server via WebSocket. Executes commands, manages PTY sessions, runs git/filesystem operations. Minimal config — just a server URL and token.
- **Server**: Routes operations to Runners. Manages all persistent state (sessions, projects, messages, logs). Serves the frontend.
- **Frontend**: Single-page React UI with runner selection, file browsing, chat, terminal modals, and task queue.

All execution goes through a Runner — there is no local fallback on the server.

## Features

- **Multi-Machine Runners**: Install Go runners on any development machine. The UI lets you pick which runner runs each session. Supports deleting disconnected runners from the Runners dashboard.
- **TODO Sessions**: Jot down tasks as "TODO" sessions while a project has uncommitted changes or active agents. Fully unified with the normal Session model, they support auto/manual send modes, holding the prompt until the codebase is clean and no agent is running.
- **Session Archiving**: Automatically archive sessions idle for more than a configured period, or manually archive/unarchive them. Archived sessions are read-only to prevent sending new messages, while preserving history, logs, and diff views.
- **Project Readiness Warnings**: Warns before sending a message to a session when the project has uncommitted changes or a running agent, offering options to send anyway, auto-send once ready, or save as a TODO session.
- **Multi-User Token-Based Authentication**: Secure the application with token-based authentication supporting `admin` and `user` roles. Automatically generates an admin access token on first startup if not already configured. Admins can manage access tokens and configure runner-specific access control lists (restricting runners to specific user token UUIDs) from the Settings dashboard.
- **Secure WebSocket Communication**: Browser-to-server WebSocket connections are secured by passing the authentication token via the `Sec-WebSocket-Protocol` header (`arondo-token`), preventing exposure of sensitive credentials in query parameters or server logs.
- **Session-Based Workspaces**: Each task is encapsulated inside a self-contained session under the configuration directory (`~/.arondo/sessions/[sessionId]/` by default), tracking history, settings, and outputs.
- **Granular Execution Logging**: Outputs for every CLI command execution are logged separately under `~/.arondo/sessions/[sessionId]/logs/[messageId].log`.
- **Multiple AI Agents Support**: Supports **Antigravity CLI (agy)** and **Claude Code** for code generation tasks.
- **Interactive Terminal (PTY)**: Both agent and script execution run in a full pseudo-terminal via Go's `creack/pty`, rendered in the browser with `xterm.js`. Supports interactive stdin, ANSI colors, and cursor control. PTY ensures reliable process cleanup on runner exit (SIGHUP). Interactive shell terminals are spawned directly on the runner rather than the server.
- **Mobile Terminal Keyboard Bar**: Includes a mobile-specific special-keys bar (ESC, TAB, CTRL, ALT, arrows, and an FN layer for F1-F12) for the terminal modal. It dynamically tracks visualViewport to pin itself above the virtual keyboard, preventing keyboard obstruction.
- **Dedicated Execution Cards & Rich Markdown View**: Script execution uses `ScriptExecCard` (supporting inline log streaming for quick-run commands), while agent execution uses `AgentExecCard` which renders output as Markdown with syntax highlighting (`rehype-highlight`) and clickable file/URL links. Clicking a verified file path automatically opens the Remote File Browser. Users can copy the formatted markdown output or raw text output directly from the card's menu. Users can also copy chat messages using the Copy action on user chat cards.
- **Terminal Session Persistence & Reattaching**: Terminal sessions persist across browser refreshes or close events. Re-opening a terminal automatically reattaches to the active PTY session on the runner and replays the output buffer.
- **Quota & Session Limit Detection**: Automatically detects AI agent API limits (such as Claude's session limit hit or `agy` quota exhaustion) and displays human-readable error messages.
- **AI Agent Quota Monitoring**: Automatically collects quota usage data for Claude and Antigravity via tmux on the runners and displays remaining quota with progress bars in the Runners dashboard.
- **AI Agent Auto-Selection (Auto Mode)**: Automatically selects the best agent and model based on hourly and weekly quota availability retrieved from the runner.
- **Manual Agent Switching**: Switch the active agent (Antigravity CLI, Claude Code, or Auto) on-the-fly within an existing session when the agent is idle.
- **Agent Session Continuity (Resume)**: Conversations in the same session retain their agent-specific history. For Claude Code, it leverages native `--resume` functionality. For Antigravity CLI (agy), the Go runner monitors the process on exit, automatically extracts the conversation ID from its local logs, and supplies it via `--conversation` on subsequent runs.
- **Secure Prompt Passing**: Prompts are passed to agents using temporary files and environment variables (using the `ARONDO_PROMPT_FILE` environment variable), avoiding shell command-line length limits and exposing sensitive prompts in command arguments. Displays the real resolved prompt instead of original raw inputs in the "Show Prompt" panel.
- **Concurrent Script Execution**: Allows running multiple scripts simultaneously within a single session. The user can continue chatting while background scripts are running.
- **Global & Session-scoped Scripts**: Supports running project-scoped custom scripts either globally (independent of a session, directly from the project panel) or within a specific session.
- **Config-driven & Custom Slash Commands**: Slash commands (like `/new`, `/commit`, `/delete`) are config-driven and customizable. You can configure user-defined agent slash commands via the **Agent Commands** management UI in Settings (saved in `~/.arondo/agent-commands.json` by default) with regex matcher and replacement expansion support.
- **Smart Chat Input**: Supports Tab completion to cycle through slash commands in the command menu. Supports typing `@` symbol trigger to open a file/directory selector modal and insert the relative path into the chat input. Typing `!` trigger allows quick execution of project-scoped scripts (with autocompletion) or fallback to arbitrary shell commands. Keyboard behavior is streamlined: send messages on `Enter`, insert a newline on `Ctrl+Enter` / `Meta+Enter`.
- **Remote File Browsing & File Browser**: Browse directories on any connected runner directly from the UI when selecting a project path. Open a Remote File Browser with syntax highlighting (highlight.js) and a word wrap toggle option from the session's three-dot menu.
- **Global Agent Rules Sync**: Configure global agent rules in the Settings UI, which are automatically synced to `~/.gemini/GEMINI.md` and `~/.claude/CLAUDE.md` on the runners. Global rules are stored in `~/.arondo/global-rules.md`.
- **Integrated Diff Viewer (diff2html)**: View visual code changes directly from the browser, supporting session-wide diffs and single-file inline diff viewer modals triggered directly from file links in agent execution cards. Supports collapsing and expanding individual changed files dynamically inside the diff view.
- **Scheduled Tasks, Auto-Queue Follow-ups & Quota Retry**: Schedule project-scoped scripts to run at a future fixed time. Chat input remains active during agent runs; follow-up messages are automatically queued as `afterSession` scheduled tasks. If the agent hits a quota limit, it automatically schedules a retry with the last user prompt once the quota becomes available.
- **Runner Connection Stability (Heartbeat & Dead Link Detection)**: The Go runner client maintains a persistent connection with the server via periodic heartbeats, detecting dead WebSocket connections using a read deadline and ping/pong exchanges, and auto-reconnecting with exponential backoff.
- **Task Queue & Live Tracking**: Active task queue in the header with PID tracking and live log inspection. Clicking a task opens its dedicated console log modal. Each task can be killed from the queue. Completed tasks are retained for 3 days.
- **Task Grouping, Filtering & Inline Logs**: In the Tasks dashboard, tasks can be filtered by type (Agent/Script), toggled to show only non-completed tasks by default, and grouped by Scope or Status. Script execution logs are now also viewable inline.
- **Task Persistence**: Active task contexts are persisted by serializing execution metadata directly into the session and project `messages.json` files and dynamically restored on server restart. Runner IDs are stable across reconnections.
- **Automated Data Lifecycle**: Automatically purges sessions or projects during listing queries if their parent references (e.g. project or runner) no longer exist.
- **Mobile-Friendly UI**: Designed with collapsible panels, modal logs, responsive menus, and touch-friendly actions. Supports a swipe-to-delete gesture for session items in the mobile sidebar.
- **Project Management**: Scopes and tracks sessions within resolved repository paths. Supports custom project scripts and AI auto-script discovery (executed safely on the selected runner).

## Getting Started

### 1. Install dependencies and start the server

```bash
npm install
npm run dev
```

### 2. Build and start a runner

```bash
cd runner
go build -o arondo-runner .
# Pass the runner token printed in the server console on startup
./arondo-runner --server ws://localhost:3251/runner --token <runner_access_token>

# Alternatively, pass it via environment variable:
# ARONDO_RUNNER_TOKEN=<runner_access_token> ./arondo-runner --server ws://localhost:3251/runner
```

Or use the convenience script:

```bash
./scripts/run.runner.sh
```

### 3. Open the UI

Open [http://localhost:3251](http://localhost:3251) in your browser. Select the connected runner, choose a project directory, and start a session.

## Configuration & Environment Variables

- `ARONDO_CONFIG_DIR` – (Optional) Custom directory to store configuration and runtime data. Defaults to `~/.arondo` in both development and production.
- `PORT` – (Optional) Server port. Defaults to `3251` in development, `3250` in production.
- `ARONDO_SESSION_ARCHIVE_DAYS_DEFAULT` – (Optional) Default number of idle days before active sessions are auto-archived, used when no override is set in Settings. Defaults to `7`.

### Configuration Files (in `ARONDO_CONFIG_DIR` or `~/.arondo/`)

- `tokens.json` – Multi-user and runner access tokens database. Stored with the following structure:
  ```json
  {
    "clients": [
      {
        "token": "32-character-hex-string",
        "uuid": "canonical-uuid-string",
        "name": "Display Name",
        "type": "admin"
      }
    ],
    "runner": "32-character-runner-access-token"
  }
  ```
  If no token with `type: "admin"` exists on startup, or if the `runner` token is missing, they are generated automatically, written to the config, and printed in the server logs.
- `global-rules.md` – Rules synced to `~/.gemini/GEMINI.md` and `~/.claude/CLAUDE.md` on connected runners.
- `agent-commands.json` – User-defined agent slash commands.

## Runner CLI

```
arondo-runner [flags]

Flags:
  --server string   Server WebSocket URL (default "ws://localhost:3251/runner")
  --token string    Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)
```

The runner auto-reconnects with exponential backoff if the server connection drops. It has no display name of its own — the name shown across the UI comes from the runner token's `name`, set by an admin when generating the token in Settings.

## Testing

Integration tests are implemented using Playwright. They spawn a mock-configured server and a Go runner to test API endpoints and WebSocket operations end-to-end.

To run the integration tests:

```bash
npm run test:integration
```

The test runner will:
1. Build the Go runner binary.
2. Spin up the Next.js server on port `3252` using a temporary config directory (`.arondo-test/`).
3. Spawn the Go runner to connect to the test server.
4. Run server API tests (`tests/server/`) and runner-capabilities tests (`tests/runner/`).
5. Terminate all test processes and clean up temporary test configurations and logs automatically.

