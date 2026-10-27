---
name: arondo-cli
description: Delegate tasks to an AI agent, run fast categorical decisions with Jev System One, or inspect runner and quota status through Arondo CLI when a reachable Arondo server and Runner should perform the work. Use for creating, continuing, and collecting results from remote agent sessions; not for direct local model CLIs.
---

# Arondo CLI

Use `cli/arondo-cli` to interact with an Arondo server: delegate bounded tasks to remote AI coding agents with `send`, execute fast categorical classifications without a runner using `decide`, or inspect runner and session status with read-only commands.

## Before delegation

Confirm that the target Arondo checkout provides the built `cli/arondo-cli` binary, and obtain a permitted server URL and client token. The CLI accepts command-line options, `ARONDO_SERVER` / `ARONDO_CLIENT_TOKEN`, or the `cli` object in `~/.arondo/arondo.json` (or `$ARONDO_CONFIG_DIR/arondo.json`). Earlier sources in that list take precedence:

```json
{
  "cli": {
    "server": "https://arondo.example",
    "clientToken": "client_access_token"
  }
}
```

```bash
cli/arondo-cli send --server "$ARONDO_SERVER" --client-token "$ARONDO_CLIENT_TOKEN" ...
```

Treat the token as a secret: do not echo it, include it in prompts, or put it in reports. Choose a connected Runner with `--runner-id` whenever the local hostname does not uniquely identify the intended Runner.

## Start a task (`send`)

Use an explicit repository path for work in an existing project. When `--path`, `--automation`, `--temp-dir`, and `--no-path` are omitted, the current working directory is used as the repository path. Keep the prompt self-contained: name the expected outcome, relevant files or constraints, and validation expected from the delegated agent.

```bash
cli/arondo-cli send \
  --server "$ARONDO_SERVER" \
  --client-token "$ARONDO_CLIENT_TOKEN" \
  --runner-id "<runner-id>" \
  --path "/absolute/path/on/the/runner" \
  --agent auto \
  --output json \
  "Implement the requested change and run the relevant validation."
```

- **Agent selection (`--agent`)**: Choose from `auto`, `antigravity`, `claude`, `codex`, `opencode`, or `decision`. Prefer `auto` unless a specific agent is requested.
- **Automation (`--automation`)**: Create a project-free session marked `automation: true` with a fresh Runner-side workspace in `${ARONDO_CONFIG_DIR:-$HOME/.arondo}/automation-workspaces/`, named with a UTC datetime and random suffix. Without `--runner-id`, an accessible connected Runner is selected at random. Decision agents need neither a Runner nor a workspace. Sessions, tasks, search results, todos, and notifications are hidden unless an admin enables **Show automation sessions**. Direct session-ID access still works. Workspaces are retained until manually removed, including after session deletion. Do not combine with `--path`, `--no-path`, `--temp-dir`, `--resume`, or `--session-id`. To continue later, use `send --session-id <id>` without `--automation`.
- **Isolated runs (`--temp-dir` / `--no-path`)**: `--temp-dir` is deprecated and emits a warning on stderr; its existing behavior is unchanged. Prefer `--automation` for new automation calls. Use `--temp-dir` to create the session in a fresh temporary directory on the runner (mutually exclusive with `--path`; cannot be combined with `--resume`). Use `--no-path` to create the session in a dedicated temporary directory without a project path.
- **Single-use & caching (`--once`, `--cache`)**: Pass `--once` with `--automation` (or legacy `--temp-dir`) to create a single-use session that rejects follow-up messages. Add `--cache on` (default: `off`, requires `--once`) to return cached results from `${ARONDO_CONFIG_DIR}/cache/once/` for matching prompt hashes without invoking an agent for seven days. Expired files remain on disk and are refreshed after a successful agent run.
- **Polling & Timeout**: The command blocks until completion (defaults: 3-second polling via `--poll-interval` and 600-second timeout via `--timeout`).
- **Failures**: A failed session exits nonzero and prints its failure reason to stderr. If a completion event omits the reason, the CLI refreshes it from the session API. JSON stdout stays machine-readable.
- **Output format (`--output`)**: Defaults to `plain` (streams terminal output in real time). Set `--output json` to output structured JSON with `sessionId` and `rawOutput` (for `decide`, it also includes native Jev `decisionAnswers`). Set `--output html` to output rendered HTML.

## Continue a task

For a known session, preserve its conversation context with `--session-id`:

```bash
cli/arondo-cli send --server "$ARONDO_SERVER" --client-token "$ARONDO_CLIENT_TOKEN" \
  --session-id "<session-id>" "Address the failing test and rerun it."
```

Use `--resume` to continue the most recently updated session for the chosen Runner and repository path. Do not combine it with `--session-id`, `--automation`, `--temp-dir`, or `--no-path`.

`send` also accepts configured Agent Commands such as `/commit` and `/commit message`. The server resolves matching built-in, default, and project commands before running or queueing the agent, including matcher capture groups such as `$1`. The session history keeps the slash command as the displayed message and records the expanded instruction as the prompt. Commands such as `/review` and `/btw` that run in a separate context require an existing session.

## Handle outcomes

When using `--output json`, parse the stdout JSON: `sessionId` identifies the session for follow-ups, and `rawOutput` contains the agent stdout. For `decide`, use `decisionAnswers` rather than parsing the formatted output. In `html` mode, rendered HTML is written to stdout upon completion. In `plain` mode, output is streamed to stdout and the session ID is logged to stderr. A non-zero exit means the session ended in an error or the CLI could not complete the request.

If the CLI returns `needsConfirmation: true` (e.g. uncommitted changes in the repository or an agent is already running), inspect why the project is dirty or busy. Retry with `--confirmation auto`, `--confirmation draft`, or `--confirmation force` according to user intent:
- `auto`: Queue for automatic send once the project/codebase is ready.
- `draft`: Save as a manual draft.
- `force`: Bypass the dirty/busy check and send immediately.

Do not automatically retry failed commands or use `--confirmation force` merely to make a delegation proceed without explicit intent.

## Fast Categorical Decisions (`decide`)

Run fast categorical decisions, classifications, triage, or probability evaluations powered by TypeSafe AI's System One model (`jev-latest`) without spawning a coding agent or connecting a runner:

```bash
cli/arondo-cli decide '{
  "state": "Our API integration started returning 500 errors on every request about 20 minutes ago, and we cannot process customer orders.",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this",
      "criteria": {
        "billing": "Payment or subscription issues",
        "technical": "Bugs or integration problems",
        "sales": "Pricing or account questions"
      }
    },
    "frustration": {
      "type": "score",
      "instructions": "How frustrated the customer appears",
      "criteria": [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}'
```

Or pipe JSON directly via standard input:

```bash
cat payload.json | cli/arondo-cli decide
```

- **Input format**: Expects a JSON object containing a `questions` map. Supported question primitives:
  - `choice`: Categorical selection among string options (`choices` array or `criteria` map with descriptions).
  - `score`: Ordered evaluation scale between 2 and 10 levels (`criteria` array).
  - `noul`: Bernoulli truth probability estimation between 0.0 and 1.0 (True/False propositions).
  - Optional `state` context; optional `model` override.
- **Server-Side Execution**: Runs directly on the server via `TYPESAFE_API_KEY` (in ~180ms) without requiring a connected runner or git repository.
- **Ephemeral & Web-Clean**: Automatically runs with `--temp-dir` and `--once` semantics.
- **Output**: Formatted plain text by default, or structured JSON when using `--output json`. JSON output includes `decisionAnswers`, the native Jev answer map with choices, probabilities, and confidence values.

## Inspection & Diagnostic Commands

Inspect runner readiness, quota, active sessions, and conversation history before delegating work:

```bash
# Check agent availability on accessible runners (including quota reasons)
cli/arondo-cli get-agents

# View latest recorded quota usage across runners
cli/arondo-cli get-quota

# Force an asynchronous quota refresh across runners
cli/arondo-cli update-quota

# List active sessions
cli/arondo-cli get-sessions

# List accessible projects
cli/arondo-cli get-projects

# Print full conversation history of a session (supports --output plain, json, or html)
cli/arondo-cli get-messages --session-id "<session-id>" --output html
```

All commands use the same server and token resolution order (`--server` / `--client-token` > env vars > `~/.arondo/arondo.json`).
