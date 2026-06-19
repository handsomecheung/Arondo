# Itero – Project Context

## Overview
Itero is a Next.js full-stack application that enables mobile-first software development
by delegating coding tasks to AI agents (starting with Gemini CLI).

## Key Architecture

```
app/
  page.tsx              # Main UI (chat, status tracking, PR management, log modals)
  layout.tsx            # Root layout
  globals.css           # Design system (collapsible error styling, delete button animations)
  api/
    sessions/
      route.ts          # POST: create session & run agent; GET: list sessions
      [id]/
        route.ts        # DELETE: delete session (moves to data/deleted-sessions/)
        log/
          route.ts      # GET: fetch run log for specific messageId
        messages/
          route.ts      # POST: add user follow-up message & trigger agent (resume mode)
        pr/
          route.ts      # POST: trigger GitHub Pull Request creation
    messages/route.ts   # GET: list messages for a session
    stream/route.ts     # SSE endpoint for real-time updates (session_updated, message_added, session_deleted, agent_output)
    webhook/route.ts    # GitHub Webhook receiver (PR review comments → agent follow-up in resume mode)
lib/
  store.ts              # File-based JSON storage (sessions, messages, logs)
  event-bus.ts          # In-memory SSE pub/sub (singleton)
  agents/
    base.ts             # Abstract BaseAgent interface
    gemini.ts           # Gemini CLI adapter (handles --session-id and --resume options)
    index.ts            # AgentFactory (add new agents here)
data/                   # Runtime data (gitignored)
  sessions/
    [sessionId]/
      session.json      # Session metadata (status, prompt, agent, repoPath)
      messages.json     # Message history within the session
      logs/
        [messageId].log # Executing run output logs bound to specific system message ID
  deleted-sessions/     # Soft-deleted sessions moved here upon deletion
```

## Adding a New Agent
1. Create `lib/agents/<name>.ts` implementing `BaseAgent`
2. Register it in `lib/agents/index.ts` AGENTS map

## Environment Variables
- `GITHUB_WEBHOOK_SECRET` – Optional. Used to verify GitHub webhook signatures.

## Development
```bash
npm run dev   # Start dev server on http://localhost:3250
```

## Core Logging & Session Lifecycle Features
- **Message-specific execution logs**: Every agent execution creates a specific system message (`⚙️ Executing command...`). The resulting terminal outputs are streamed and stored in `data/sessions/[sessionId]/logs/[systemMsgId].log`. The UI displays a trigger button underneath each command run to open a modal for that execution log.
- **Session Resumption**: The first agent execution uses `gemini --session-id <sessionId>`. Subsequent follow-ups (manual chat messages or webhook reviews) use `gemini --resume <sessionId>` to maintain the context.
- **Collapsible Errors**: When an agent call fails, the visual output (`❌ Error` or `❌ Internal error`) is wrapped in a native `<details>` accordion so users can expand the details manually.
- **Session Deletion**: Users can click the trash icon (visible on hover) to delete a session. The backend relocates the session folder under `data/deleted-sessions/` for soft-deletion.
