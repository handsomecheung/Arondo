import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";
import { stripAnsi } from "../ansi";
import { getAgentSessionIdSync, saveAgentSessionId } from "./sessionMap";

// Codex prints this header line (bolded) at the start of every `exec` run
// (fresh or resumed), e.g. "\x1b[1msession id:\x1b[0m 019f9883-...\r".
const SESSION_ID_RE = /session id:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/** Extracts Codex's own session id from a run's raw stderr output. */
export function extractCodexSessionId(log: string): string | undefined {
  return stripAnsi(log).match(SESSION_ID_RE)?.[1];
}

function getCodexSessionIdSync(sessionId: string): string | undefined {
  return getAgentSessionIdSync("codex", sessionId);
}

export async function saveCodexSessionId(sessionId: string, codexId: string): Promise<void> {
  try {
    await saveAgentSessionId("codex", sessionId, codexId);
  } catch (err) {
    console.error("Failed to save codex session mapping:", err);
  }
}

/**
 * Adapter for OpenAI Codex CLI (https://github.com/openai/codex).
 *
 * Uses the non-interactive `codex exec` mode with sandbox/approval bypassed,
 * matching the "no interactive prompts" contract the other agent adapters rely on.
 * Codex has no upfront `--session-id` equivalent to Claude's, so follow-ups resume
 * by the exact session id Codex printed on the prior run (see CODEX_SESSION_ID_RE,
 * captured post-exit in runner-manager.ts). If that id hasn't been captured yet,
 * we deliberately do NOT fall back to `resume --last` — with several Arondo
 * sessions running concurrently against the same repoPath, `--last` (a cwd-based
 * guess) could resume a different session's conversation. Starting fresh loses
 * context for that one run; grabbing the wrong session silently would be worse.
 */
// Codex has no dedicated reasoning-effort flag on `--model`; it's set via the
// `-c model_reasoning_effort=` config override instead. Callers (e.g. the auto
// mode selector) pass model strings as "<model> <effort>" (e.g. "gpt-5.5 medium").
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high"]);

function buildModelArgs(model: string): string {
  const parts = model.trim().split(/\s+/);
  const last = parts[parts.length - 1]?.toLowerCase();
  if (parts.length > 1 && REASONING_EFFORTS.has(last)) {
    const modelName = parts.slice(0, -1).join(" ");
    return ` --model "${modelName}" -c model_reasoning_effort="${last}"`;
  }
  return ` --model "${model}"`;
}

export class CodexAgent extends BaseAgent {
  readonly name = "codex";

  getCommand({ sessionId, isResume, model, effort }: Omit<AgentRunOptions, "onOutput">): string {
    // Flags for `exec` itself (sandbox/approval bypass, model) must precede the
    // `resume` subcommand — placed after it, they're parsed as `resume`'s own
    // args instead and silently fail to take effect.
    const modelArg = model
      ? effort
        ? ` --model "${model}" -c model_reasoning_effort="${effort}"`
        : buildModelArgs(model)
      : "";
    const codexId = isResume && sessionId ? getCodexSessionIdSync(sessionId) : undefined;
    const resumeArg = codexId ? `resume "${codexId}" ` : "";
    return `codex exec --dangerously-bypass-approvals-and-sandbox${modelArg} ${resumeArg}"$(< "$${PROMPT_ENV_VAR}")"`;
  }
}
