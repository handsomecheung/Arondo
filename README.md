Translated by AI([日本語](README.ja.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md))

# Arondo

Arondo is a mobile-first developer workspace that delegates coding tasks to AI agents and monitors executions across multiple machines. It follows a **Frontend + Server + Runner** architecture where lightweight Go-based Runners are installed on development machines and the central Server coordinates all operations.

## Basic Workflow

Arondo lets you delegate work to an AI agent from a mobile-friendly workspace, review the changes, validate them, and continue the same conversation until the task is ready to commit.

### 1. Start a session

Choose a Runner, project, and agent, then describe the task and send it.

<img src="public/readme/basic-usage/01-create-session.jpg" alt="Creating a new session by choosing a runner, project, and agent, then entering a task" width="360">

### 2. Review, validate, and commit

Review the agent result and diff, run validation, provide follow-up instructions when needed, and finish by committing the completed work from the same session.

<p>
  <img src="public/readme/basic-usage/02-review-result.jpg" alt="Completed Codex response with changed-file links and a follow-up message input" width="360">
  <img src="public/readme/basic-usage/03-review-changes.jpg" alt="Git diff viewer showing changed files and inline additions and deletions" width="360">
  <img src="public/readme/basic-usage/04-run-test.jpg" alt="Session script card showing integration test output" width="360">
  <img src="public/readme/basic-usage/05-follow-up-fix.jpg" alt="Failed test output followed by a request to reapply the application changes" width="360">
  <img src="public/readme/basic-usage/06-commit.jpg" alt="Completed commit agent command and final Codex response" width="360">
</p>

## Agent Commands

Create reusable slash commands in **Settings → Agent Commands** by defining the command name, the instruction sent to the agent, and, when needed, a regular-expression matcher whose capture groups can be inserted as `$1`, `$2`, and so on; type `/` in a session to browse and run built-in and custom commands.

Two built-in commands start an agent in a fresh, separate context without continuing or changing the parent agent conversation:

- `/review [--agent agy] [instructions]` reviews the current working tree for correctness, regressions, security issues, and missing tests. It does not modify files.
- `/btw [--agent agy] <message>` asks an independent side question using the parent session's normal conversation context. It does not modify files.

Both commands appear as separate agent tasks and retain their own execution output. `agy` is an alias for Antigravity; the same option also accepts `antigravity`, `claude`, `codex`, `opencode`, or `auto`.

<p>
  <img src="public/readme/agent-command-add.png" alt="Agent Commands settings form for creating a custom slash command" width="360">
  <img src="public/readme/agent-command-list.png" alt="Session command menu listing built-in and custom slash commands" width="360">
</p>

## Scripts

Save a named shell command for a project through **Edit Scripts**, then type `!` in a session to select and run it, choose a file to execute, or enter an ad-hoc command.

<p>
  <img src="public/readme/script-add.png" alt="Add Script dialog with name and command fields" width="360">
  <img src="public/readme/script-list.png" alt="Session quick-run menu showing saved scripts after typing an exclamation mark" width="360">
</p>

## Terminal

Open a live shell on the selected Runner from a session’s three-dot menu when you need to inspect or recover from an exceptional situation.

> **Fallback only:** Arondo is designed around agents and saved scripts, which are the recommended ways to work. The Terminal is provided as a safety net, not as the primary workflow; its dense command-line interface is particularly uncomfortable to use on mobile devices.

<p>
  <img src="public/readme/terminal-menu.png" alt="Session three-dot menu with the Open Terminal action" width="360">
  <img src="public/readme/terminal-htop.png" alt="Live terminal running htop with the mobile special-key bar" width="360">
</p>

## Todo Messages

Save a prompt as a Todo Message when the project is busy or has uncommitted changes, then choose whether to send it automatically once the codebase is ready, manually later, or at a scheduled time; pending messages remain visible in the session until they are dispatched.

<p>
  <img src="public/readme/todo-new.png" alt="New session form with automatic, manual, and scheduled Todo Message modes" width="360">
  <img src="public/readme/todo-confirm.png" alt="Project-not-ready dialog offering automatic, manual, and immediate send options" width="360">
  <img src="public/readme/todo-message.png" alt="Pending Todo message waiting for the codebase to be ready" width="360">
</p>

## Auto Mode

Select **Auto** in the agent picker to let Arondo choose among the agent CLIs installed on the selected Runner. The **Runners** page shows the quota data that informs this choice.

Auto Mode uses the following order of preference:

1. Consider installed Antigravity, Claude, and Codex CLIs with known subscription quota; API-key-billed accounts are held back as a last resort.
2. Deprioritize agents with less than 15% hourly quota remaining when another candidate has sufficient capacity; if every candidate is low, keep all of them available.
3. Rank the remaining candidates by weekly quota remaining, adjusted for how much time is left before the weekly reset.
4. If no subscription quota is known, use an agent with unknown quota before falling back to an API-key-billed agent.

After Auto Mode has selected the agent, **mrouter** (Model Router) can optionally choose that agent's model and reasoning effort using a lightweight LLM call through the Vercel AI SDK. mrouter is only enabled when an Anthropic, OpenAI, or Google API key is configured in Settings or through the server environment. It receives the selected agent, the quota-filtered model options for that agent, and the user message, then must choose one of those provided options. If no key is configured, the request times out, the provider returns an error, or the model choice is invalid, Arondo falls back to the predefined model selected by the existing quota-based logic.

<img src="public/readme/auto-mode-quota.png" alt="Runner page showing Claude, Antigravity, and Codex quota information used by Auto Mode" width="360">

## Access Control

Configure authentication from **Settings** with three related controls:

- **System Access Tokens** authenticate people and automations to Arondo. Create `admin` tokens for full administrative access and `user` tokens for restricted access; token values are only shown in full when generated, so store them securely.
- **Runner Tokens** authenticate each Runner machine. Generate one dedicated token per Runner and pass it with `--token` or `ARONDO_RUNNER_TOKEN`; it binds to the first Runner identity that connects, preventing a leaked token from impersonating a different Runner.
- **Runner Access Control** grants individual `user` tokens access to selected Runners. Admin tokens can access every Runner; users can access only the Runners that explicitly include their token, so a Runner with no selected users remains admin-only.

<img src="public/readme/access-control.png" alt="Settings page for system access tokens, runner tokens, and per-runner access control" width="360">

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
- **Todo Messages (Drafts, Scheduled Send, Auto-Queue Follow-ups & Quota Retry)**: "Send this message later" is a single `user-todo` chat message with a status/trigger (manual, codebaseReady, afterSession, quotaAvailable, or a fixed time), rendered inline with a three-dot menu (Cancel / Send Now / Change Trigger). Covers TODO drafts saved while a project has uncommitted changes or a running agent, follow-ups queued behind a running agent, and automatic quota-exhaustion retries — all shown as first-class tasks in the Tasks dashboard. A session can queue multiple todo messages at once; the chat input stays enabled while a draft/pending todo exists so you can keep composing further follow-ups. The chat input's "+" popup menu offers "Upload File", "Send Later" (manual), "Send When Clean" (codebaseReady), and "Schedule Send" (pick a future date/time) — all backed by the same todo-messages plumbing. Scheduled ("at") todos left stuck mid-send by a server restart are automatically resolved to `failed` instead of hanging.
- **Session Archiving**: Automatically archive sessions idle for more than a configured period, or manually archive/unarchive them. Pinned sessions are exempted from auto-archiving. Archived sessions are read-only to prevent sending new messages, while preserving history, logs, and diff views. The default idle day count before auto-archiving is configurable in the Settings page. Unarchiving a session is disabled if its parent project has been deleted. Before deleting a project, a warning dialog flags any associated archived sessions that would become unusable.
- **Recent Sessions, Pinning, Filtering & Three-dot Menu**: The sidebar is centered on recent sessions, with a lightweight Archived Sessions hint instead of a separate Projects tab. Pin important sessions to the top (ordered by pinned timestamp), filter by project or runner when needed, and use each session's three-dot menu to Pin, Rename, Archive, or Delete it.
- **Project Readiness Warnings**: Warns before creating a session or sending the first message on an empty session when the project has uncommitted changes or a running agent, offering options to send anyway, auto-send once ready, or save as a TODO session. The "Send now anyway" option is hidden when an agent is already running, since the server always rejects it in that case. Follow-up messages on a session that already has history skip this check and only block on that session's own running state or an already-queued todo.
- **Project Three-dot Menu**: The Project Page header offers a three-dot menu with File Browser, Open Terminal, Show Changes (a sessionless visual diff of the project's working tree, disabled when clean), and Delete Project.
- **Multi-User Token-Based Authentication**: Secure the application with token-based authentication supporting `admin` and `user` roles. Automatically generates an admin access token on first startup if not already configured. Client tokens support custom names and distinct colors, which are displayed on user message cards alongside sender avatars. Admins can manage access tokens and configure runner-specific access control lists (restricting runners to specific user token UUIDs) from the Settings dashboard.
- **Secure WebSocket Communication**: Browser-to-server WebSocket connections are secured by passing the authentication token via the `Sec-WebSocket-Protocol` header (`arondo-token`), preventing exposure of sensitive credentials in query parameters or server logs.
- **Session-Based Workspaces**: Each task is encapsulated inside a self-contained session under the configuration directory (`~/.arondo/sessions/[sessionId]/` by default), tracking history, settings, and outputs.
- **Detached Review & Side-Question Agents**: Run `/review` to inspect the current working tree or `/btw <message>` to ask a side question without interrupting the parent agent session. Each run receives copied normal session context, uses a fresh agent conversation, never modifies files by instruction, and is displayed and retained as a separate task with its own output.
- **Granular Execution Logging**: Outputs for every CLI command execution are logged separately under `~/.arondo/sessions/[sessionId]/logs/[messageId].log`, with stderr captured in adjacent `.stderr.log` files when agents run in piped mode. Stderr output can be viewed in a modal from the agent execution card's menu (Show Stderr).
- **Multiple AI Agents Support**: Supports **Antigravity CLI (agy)**, **Claude Code**, **Codex**, and **OpenCode** for code generation tasks.
- **Interactive Terminal (PTY)**: Both agent and script execution run in a full pseudo-terminal via Go's `creack/pty`, rendered in the browser with `xterm.js`. Supports interactive stdin, ANSI colors, and cursor control. PTY ensures reliable process cleanup on runner exit (SIGHUP). Interactive shell terminals are spawned directly on the runner rather than the server.
- **Mobile Terminal Keyboard Bar**: Includes a mobile-specific special-keys bar (ESC, TAB, CTRL, ALT, arrows, and an FN layer for F1-F12) for the terminal modal. It dynamically tracks visualViewport to pin itself above the virtual keyboard, preventing keyboard obstruction.
- **Dedicated Execution Cards & Rich Markdown View**: Script execution uses `ScriptExecCard` (supporting inline log streaming for quick-run commands), while agent execution uses `AgentExecCard` which renders output as Markdown with syntax highlighting (`rehype-highlight`) and clickable file/URL links. Clicking a verified file path automatically opens the Remote File Browser. Users can copy the formatted markdown output or raw text output directly from the card's menu. Users can also copy chat messages using the Copy action on user chat cards.
- **Terminal Session Persistence & Reattaching**: Terminal sessions persist across browser refreshes or close events. Re-opening a terminal automatically reattaches to the active PTY session on the runner and replays the output buffer.
- **Quota & Session Limit Detection**: Automatically detects AI agent API limits (such as Claude's session limit hit, Codex limits, or `agy` quota errors including individual quota exhaustion and subscription upgrade warnings by scanning both stdout and stderr logs) and displays human-readable error messages.
- **AI Agent Quota Monitoring**: Automatically collects quota usage data for Claude, Antigravity, and Codex via tmux on the runners, recognizes API-key billing accounts, and displays known remaining quota or an explicit unknown state in the Runners dashboard.
- **AI Agent Auto-Selection (Auto Mode)**: Automatically selects the best agent from known subscription quotas, preferring available capacity over unknown data and using API-key billed choices only as a last fallback. When configured, mrouter makes a second-stage model/effort choice from only the quota-filtered options that Auto Mode passes to it.
- **Manual Agent Switching**: Switch the active agent (Antigravity CLI, Claude Code, Codex, OpenCode, or Auto) on-the-fly within an existing session when the agent is idle.
- **Agent Session Continuity (Resume)**: Conversations in the same session retain their agent-specific history. Claude Code uses native resume support, Codex CLI stores and reuses Codex session IDs, OpenCode CLI stores and reuses OpenCode session IDs, and Antigravity CLI (agy) stores detected conversation IDs for subsequent `--conversation` runs.
- **Secure Prompt Passing**: Prompts are passed to agents using temporary files and environment variables (using the `ARONDO_PROMPT_FILE` environment variable), avoiding shell command-line length limits and exposing sensitive prompts in command arguments. Displays the real resolved prompt instead of original raw inputs in the "Show Prompt" panel.
- **Concurrent Script Execution**: Allows running multiple scripts simultaneously within a single session. The user can continue chatting while background scripts are running. Also supports running project-scoped scripts while an agent is executing.
- **Global & Session-scoped Scripts**: Supports running project-scoped custom scripts either globally (independent of a session, directly from the project panel) or within a specific session.
- **Config-driven & Custom Slash Commands**: Built-in slash commands (like `/new`, `/delete`, `/rename <name>`, `/review`, and `/btw <message>`) and custom user-defined agent slash commands are config-driven and customizable. `/review` and `/btw` are dispatched as detached agents rather than normal follow-up messages. You can configure user-defined agent slash commands via the **Agent Commands** management UI in Settings (saved in `~/.arondo/agent-commands.json` by default) with regex matcher and replacement expansion support.
- **Smart Chat Input, Drafts & File Uploads**: Supports Tab completion to cycle through slash commands in the command menu. Supports typing `@` symbol trigger to open a file/directory selector modal and insert the relative path into the chat input. Direct file uploads are supported in the chat input (files are sent to the runner's temporary directory and the resolved path is passed to the agent). Chat drafts are persisted in `localStorage` per session to survive switching sessions or client reloads. Typing `!` trigger allows quick execution of project-scoped scripts (with autocompletion), including while creating a new session, your 5 most-used ad-hoc history commands, a "Select…" entry to run a picked file directly as a shell command, or fallback to arbitrary shell commands. Keyboard behavior is streamlined: send messages on `Enter`, insert a newline on `Ctrl+Enter` / `Meta+Enter`. Also supports a global reload shortcut (`F5` or `Ctrl+R` / `Cmd+R`) for PWA/Standalone app use, and manual "Refresh App" buttons across the application.
- **Remote File Browsing & File Browser**: Browse directories on any connected runner directly from the UI when selecting a project path. Open a Remote File Browser from the session's three-dot menu, featuring code syntax highlighting (loaded in 64KB chunks on scroll to support files of any size), a word wrap toggle, and an admin-configurable hidden-files setting.
- **Global Agent Rules Sync**: Configure global agent rules in the Settings UI, which are automatically synced to `~/.gemini/GEMINI.md`, `~/.claude/CLAUDE.md`, and `~/.codex/AGENTS.md` on the runners. Global rules are stored in `~/.arondo/global-rules.md`.
- **Integrated Diff Viewer (diff2html) & Commit History**: View visual code changes directly from the browser, supporting session-wide diffs and single-file inline diff viewer modals triggered directly from file links in agent execution cards. Supports collapsing and expanding individual changed files dynamically inside the diff view. Also supports viewing git commit history and specific commit diffs (Show Commits) via a modal.
- **Scheduled Tasks, Auto-Queue Follow-ups & Quota Retry**: Schedule project-scoped scripts to run at a future fixed time. Chat input remains active during agent runs; follow-up messages are automatically queued as `afterSession` scheduled tasks. If the agent hits a quota limit, it automatically schedules a retry with the last user prompt once the quota becomes available.
- **Runner Connection Stability (Heartbeat & Dead Link Detection)**: The Go runner client maintains a persistent connection with the server via periodic heartbeats, detecting dead WebSocket connections using a read deadline and ping/pong exchanges, and auto-reconnecting with exponential backoff.
- **Task Queue & Live Tracking**: Active task queue in the header with PID tracking and live log inspection. Clicking a task opens its dedicated console log modal. Each running task can be killed from the queue, and stopped project-scoped tasks can be deleted from their three-dot menu. Completed tasks are retained for 3 days, and are removed from the queue as soon as their session is archived. Tasks and todo messages belonging to temp-dir projects are automatically filtered out from the active queue and Tasks dashboard.
- **Task Grouping, Filtering & Inline Logs**: In the Tasks dashboard, tasks can be filtered by type (Agent/Script), toggled to show only non-completed tasks by default, and grouped by Scope or Status. Script execution logs are now also viewable inline.
- **Task Persistence**: Active task contexts are persisted by serializing execution metadata directly into the session and project `messages.json` files and dynamically restored on server restart. Runner IDs are stable across reconnections.
- **Automated Data Lifecycle**: Automatically purges sessions or projects during listing queries if their parent references (e.g. project or runner) no longer exist.
- **Mobile-Friendly UI**: Designed with collapsible panels, modal logs, responsive menus, and touch-friendly actions. Supports a swipe-to-delete gesture for session items in the mobile sidebar.
- **Project Management**: Scopes and tracks sessions within resolved repository paths. Supports custom project scripts and AI auto-script discovery (executed safely on the selected runner).
- **Unread Session Completion Indicator**: Automatically tracks when background running sessions complete (`done` or `error`). It compares the session's `completedAt` timestamp with the user's `lastViewedAt` timestamp. If a session has unviewed completions, the UI displays a colored dot next to the session in the sidebar (green for success, red for error) and an unread count badge in the header menu button.
- **PWA / Installable App**: Ships a web app manifest (`app/manifest.ts`) and a registered service worker (`public/sw.js`) so the app can be installed to the home screen with a standalone window, including on Android Chrome which requires a service worker with a fetch handler for full installability.

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

### 3. Build the CLI (optional)

```bash
cd cli
go build -o arondo-cli .
cd ..
```

### 4. Open the UI

Open [http://localhost:3251](http://localhost:3251) in your browser. Select the connected runner, choose a project directory, and start a session.

## Configuration & Environment Variables

- `ARONDO_CONFIG_DIR` – (Optional) Custom directory to store configuration and runtime data. Defaults to `~/.arondo` in both development and production.
- `PORT` – (Optional) Server port. Defaults to `3251` in development, `3250` in production.
- `ARONDO_SESSION_ARCHIVE_DAYS_DEFAULT` – (Optional) Default number of idle days before active sessions are auto-archived, used when no override is set in Settings. Defaults to `7`.
- `ARONDO_FILE_SHOW_HIDDEN_DEFAULT` – (Optional) Default for whether hidden files/directories (dotfiles) appear in the file browser and @ path selector, used when no override is set in Settings. Defaults to `true`; set to `false` to hide dotfiles by default.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` – Provider API keys used by `mrouter`, checked in that order. These can also be configured from Settings and stored in `arondo.json`; environment variables take precedence and disable editing for that provider in the UI. If none are configured, Auto Mode keeps using the predefined model selected by the existing quota-based logic. The router provider, router model, and timeout are fixed in code.

### Configuration Files (in `ARONDO_CONFIG_DIR` or `~/.arondo/`)

- `arondo.json` – Unified runtime config containing multi-user access tokens, per-runner access tokens, and global app settings. Stored with the following structure:
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
    "runners": [
      {
        "id": "token-id",
        "token": "32-character-hex-string",
        "name": "Runner Token Name",
        "createdAt": 1720000000000,
        "lastUsedAt": 1720000100000,
        "boundRunnerId": "server-generated-runner-id"
      }
    ],
    "cli": {
      "url": "https://arondo.example",
      "token": "client-access-token"
    },
    "setitngs": {
      "sessionArchiveDays": 7,
      "showHiddenFiles": true
    }
  }
  ```
  If no token with `type: "admin"` exists on startup, one is generated automatically, written to the config, and printed in the server logs. Runner tokens are created and managed individually by an admin in Settings (Runner Tokens section); each locks to the first runner identity that registers with it (`boundRunnerId`).
  The CLI reads `cli.url` and `cli.token` from this same file. Its connection-setting precedence is `--server` / `--token`, then `ARONDO_URL` / `ARONDO_TOKEN`, then this config file.
- `global-rules.md` – Rules synced to `~/.gemini/GEMINI.md`, `~/.claude/CLAUDE.md`, and `~/.codex/AGENTS.md` on connected runners.
- `agent-commands.json` – User-defined agent slash commands.
- Global application configuration settings are stored under the top-level `setitngs` field in `arondo.json`.
- `agent-sessions.json` – Agent conversation/session continuity map, stored as `{ "agy": {}, "codex": {}, "opencode": {} }`.

## Automation API

Scripts and external programs can drive Arondo directly over HTTP using the same REST endpoints as the UI. Three endpoints cover the full create → message → poll lifecycle:

### Authentication

Every request must include a valid client token, either as a header or a query parameter:

```
x-arondo-token: <client_access_token>
# or
?token=<client_access_token>
```

Tokens are issued by an admin from Settings → Client Tokens (`/api/auth/client-tokens`), stored in `~/.arondo/arondo.json`. A `user`-role token must also be granted access to the target runner via its `allowedUserTokenUuids` list; `admin`-role tokens can access any runner.

### 1. Create a session

```
POST /api/sessions
Content-Type: application/json
x-arondo-token: <token>

{
  "repoPath": "/path/to/repo",   // repository path on the runner — required unless "tempDir" is set
  "tempDir": false,              // optional — create the session in a fresh temp dir generated on the runner instead of "repoPath" (mutually exclusive with "repoPath")
  "runnerId": "runner-id",       // target runner (see GET /api/runners) — required, unless "tempDir" is set, in which case it's optional and a random available runner is picked
  "prompt": "Fix the login bug", // prompt sent to the agent; omit/blank to create an idle session
  "agentType": "auto",           // optional — "antigravity" | "claude" | "codex" | "opencode" | "auto" (default: "auto")
  "name": "My session",          // optional — defaults to first line of the prompt
  "force": false                 // optional — bypass the dirty-working-tree / already-running checks
}
```

- Set `tempDir: true` to have Arondo generate a temporary directory on the runner and use it as the repo path — do not pass `repoPath` in that case. `runnerId` also becomes optional; when omitted, a runner is picked at random among the runners the token is allowed to access.
- Returns `201` with the created `Session` object (includes `id`).
- Returns `409 { needsConfirmation: true, reason: { dirty, busy } }` if the repo has uncommitted changes or an agent is already running and `force` was not set — retry with `force: true` to proceed anyway.

### 2. Send a message to a session

```
POST /api/sessions/{id}/messages
Content-Type: application/json
x-arondo-token: <token>

{
  "message": "Also add a test for this", // required
  "force": false                         // optional — bypass the dirty-working-tree / already-running checks
}
```

- Runs the agent again with the new message appended to the session's history (agent session continuity/resume is preserved).
- Returns `403` if the session is archived — unarchive it first.
- If this is the first message ever sent on the session, the same dirty/busy confirmation gate as session creation applies: returns `409 { needsConfirmation: true, reason: { dirty, busy, isFollowup: false } }` unless `force: true` is set. For later follow-ups, only this session's own running state and already-queued todo messages block the send: returns `409 { needsConfirmation: true, reason: { dirty: false, busy, queued, isFollowup: true } }`.

### 3. Query session status

```
GET /api/sessions/{id}
x-arondo-token: <token>
```

- Returns the `Session` object. Check `status`, one of: `idle`, `running`, `script-running`, `done`, `error`.
- `done`/`error` means the agent finished; poll this endpoint until the status leaves `running`/`script-running`.

### CLI

`cli/arondo-cli` is a dependency-free Go CLI. Build it with `cd cli && go build -o arondo-cli . && cd ..`. Its `send` command creates a session or sends a message to an existing session, then polls until it finishes and prints the result. The required message is passed as the final positional argument.

```bash
cli/arondo-cli send \
  --server http://localhost:3251 \
  --token <client_access_token> \
  --temp-dir \
  "Print the current date"
```

The command prints the session ID. Use it to continue that conversation in a later invocation:

```bash
cli/arondo-cli send \
  --server http://localhost:3251 \
  --token <client_access_token> \
  --resume \
  "Now also print the current directory"
```

When creating a session without `--temp-dir` or `--path`, the script uses its current working directory as the repository path.
When `--runner-id` is omitted, it selects the connected runner with the current hostname; use `--runner-id` when no runner or multiple runners share that hostname.
Use `--resume` to send the message to the most recently updated session for the selected runner and repository path. It cannot be combined with `--session-id` or `--temp-dir`.
Use `--force` to send `force: true` and bypass the server's dirty-working-tree confirmation.
When the server returns `needsConfirmation: true`, the CLI prints a hint to retry with `--force`.
The final JSON result uses `sessionId` and includes the agent's stdout as `rawOutput`.
The final JSON result is written to stdout; progress messages and errors are written to stderr.

Additional CLI commands help inspect runner readiness before sending work:

```bash
cli/arondo-cli list-agents
cli/arondo-cli get-quota
cli/arondo-cli update-quota
```

`list-agents` reports whether Antigravity, Claude, Codex, and OpenCode are available on each accessible runner, including quota-derived availability reasons. `get-quota` prints the latest recorded quota data, and `update-quota` queues an asynchronous quota refresh. All CLI commands use the same connection-setting precedence: explicit `--server` / `--token`, then `ARONDO_URL` / `ARONDO_TOKEN`, then `cli.url` / `cli.token` in `~/.arondo/arondo.json`.

### Install the Arondo CLI Skill

Install the bundled `arondo-cli` skill so Codex, Claude Code, Antigravity CLI (`agy`), or OpenCode can delegate tasks through `cli/arondo-cli`:

```bash
cli/install-skill
```

Install only selected agents with `cli/install-skill codex claude`, for example. The installer refuses to replace an existing skill unless `--force` is supplied.

## Runner CLI

```
arondo-runner [flags]

Flags:
  --server string   Server WebSocket URL (default "ws://localhost:3251/runner")
  --token string    Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)
```

The runner auto-reconnects with exponential backoff if the server connection drops. It has no display name of its own — the name shown across the UI comes from the runner token's `name`, set by an admin when generating the token in Settings.

Tagged releases build both `runner/arondo-runner` and `cli/arondo-cli` binaries for Linux amd64, macOS amd64, and macOS arm64.

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
