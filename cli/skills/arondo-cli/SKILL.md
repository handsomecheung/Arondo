---
name: arondo-cli
description: Delegate a task to an LLM or coding agent through Arondo CLI when a reachable Arondo server and Runner should perform the work. Use for creating, continuing, and collecting results from remote agent sessions; not for direct local model CLIs.
---

# Arondo CLI

Use `cli/arondo-cli send` to delegate a bounded task to an Arondo-managed AI agent. The command creates or continues a server-side session, waits for completion, and writes one JSON result to stdout. Progress and errors are written to stderr.

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

## Start a task

Use an explicit repository path for work in an existing project. Keep the prompt self-contained: name the expected outcome, relevant files or constraints, and validation expected from the delegated agent.

```bash
cli/arondo-cli send \
  --server "$ARONDO_SERVER" \
  --client-token "$ARONDO_CLIENT_TOKEN" \
  --runner-id "<runner-id>" \
  --path "/absolute/path/on/the/runner" \
  --agent auto \
  "Implement the requested change and run the relevant validation."
```

Choose `--agent` from `auto`, `antigravity`, `claude`, `codex`, or `opencode`. Prefer `auto` unless the user selects a specific agent. Use `--temp-dir` only for isolated, disposable work; it cannot be combined with `--resume`.

The command blocks until completion (defaults: 3-second polling and 600-second timeout). Set `--timeout` or `--poll-interval` only when the task requires different limits.

## Continue a task

For a known session, preserve its conversation context with `--session-id`:

```bash
cli/arondo-cli send --server "$ARONDO_SERVER" --client-token "$ARONDO_CLIENT_TOKEN" \
  --session-id "<session-id>" "Address the failing test and rerun it."
```

Use `--resume` only to continue the most recently updated session for the chosen Runner and repository path. Do not combine it with `--session-id` or `--temp-dir`.

## Handle outcomes

Parse the stdout JSON. `sessionId` identifies the session for follow-ups; `rawOutput` contains the agent output. A non-zero exit means the session ended in an error or the CLI could not complete the request.

If the CLI returns `needsConfirmation: true`, inspect why the project is dirty or busy. Retry with `--confirmation auto`, `--confirmation draft`, or `--confirmation force` according to the user's intent: queue for automatic send, save as a manual draft, or send now anyway. Do not automatically retry failed commands or use `--confirmation force` merely to make a delegation proceed.
