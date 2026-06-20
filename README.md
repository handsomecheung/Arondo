# Itero

Itero is a mobile-first developer workspace interface that allows you to delegate coding tasks to local AI agents (e.g., Gemini CLI) and monitor executions, view run logs, and manage PRs directly from your browser.

## Features

- **Session-Based Workspaces**: Each task is encapsulated inside a self-contained session under `data/sessions/[sessionId]/`, tracking history, settings, and outputs.
- **Granular Execution Logging**: Outputs for every CLI command execution are logged separately under `data/sessions/[sessionId]/logs/[messageId].log`.
- **Multiple AI Agents Support**: Supports **Gemini CLI** (using `--session-id`/`--resume`) and **Antigravity CLI (agy)** (using dynamic mapping with `--conversation`) for code generation tasks.
- **Integrated Diff Viewer (diff2html)**: View visual code changes directly from the browser. Generates HTML diffs covering unstaged changes and the latest commit using `diff2html`.
- **Streamlined Action Menu**: Actions like "Commit Changes", "Create PR", "Delete Session", and "Show Diff" are folded into a clean, mobile-friendly three-dot drop-down menu.
- **Task Queue & Live Tracking**: Displays an active task queue icon in the header next to the "Live" indicator. Clicking the queue shows currently running agents and background scripts with clear visual type tagging.
- **Direct Log Inspection**: Clicking an active task in the task queue automatically switches to its session and pops up its dedicated live console log modal. Running logs display a pulsating "Streaming..." badge and auto-scroll to the latest terminal outputs.
- **Concurrent Script Execution**: Allows running multiple scripts simultaneously within a single session (only duplicate executions of the same script are restricted). The user can continue chatting while background scripts are running.
- **Enhanced Dropdowns**: Interaction dropdowns, such as the three-dot action menu and the task queue dropdown, automatically close when clicking outside their area.
- **Mobile-Friendly UI**: Designed with collapsible panels, modal logs, responsive menus, and touch-friendly actions to enable reviewing PRs and steering agents from anywhere.
- **Collapsible Errors**: When agent execution fails, large traceback logs are wrapped in an accordion details tag to keep the chat clean.
- **Session Soft-Deletion**: Move unwanted sessions out of sight. Deleted sessions are moved to `data/deleted-sessions/` on the server.
- **Project Management**: Scopes and tracks sessions within resolved local repository paths (`data/projects/[projectId]/`).
- **Custom Project Scripts**: Define, edit, and delete execution commands (e.g., build, test, deploy) scoped to specific projects.
- **AI Auto-Script Discovery**: Uses the **Antigravity CLI (agy)** in a background process to automatically inspect repository configurations and documentation, registering valid test, build, and deploy scripts.

## Getting Started

First, install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3250](http://localhost:3250) (or the port specified in terminal) in your browser.

## Configuration & Environment Variables

- `GITHUB_TOKEN` – (Optional) Personal access token used to automatically create/submit PRs from the browser.
