import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";
import { getAgentSessionIdSync, saveAgentSessionId } from "./sessionMap";

/** Marks the opencode session created for a given Arondo session, so it can be found in `session list`. */
function titleFor(sessionId: string): string {
  return `arondo-${sessionId}`;
}

/**
 * Extracts the opencode session id matching this Arondo session from the
 * stdout of `opencode session list --format json` (fetched server-side via
 * the `opencode.sessionList` runner method after a fresh run exits).
 */
export function extractOpencodeSessionId(sessionListOutput: string, sessionId: string): string | undefined {
  const arrayMatch = sessionListOutput.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return undefined;
  try {
    const list = JSON.parse(arrayMatch[0]) as Array<{ id?: string; title?: string }>;
    return list.find((s) => s.title === titleFor(sessionId))?.id;
  } catch {
    return undefined;
  }
}

export function getOpencodeSessionIdSync(sessionId: string): string | undefined {
  return getAgentSessionIdSync("opencode", sessionId);
}

export async function saveOpencodeSessionId(sessionId: string, opencodeId: string): Promise<void> {
  try {
    await saveAgentSessionId("opencode", sessionId, opencodeId);
  } catch (err) {
    console.error("Failed to save opencode session mapping:", err);
  }
}

/**
 * Adapter for OpenCode CLI (https://opencode.ai).
 *
 * Uses the non-interactive `opencode run` mode. OpenCode only prints its own
 * session id inside `--format json` event streams, never in the plain-text
 * output Arondo renders in chat, and `--continue` resumes its globally
 * most-recent session (not scoped to this repoPath) — unsafe with several
 * Arondo sessions running opencode concurrently, for the same reason the
 * Codex adapter avoids `resume --last`.
 *
 * Instead: the first run tags itself with a unique `--title` (derived from
 * the Arondo session id). Once that task exits, runner-manager.ts asks the
 * runner to run `opencode session list --format json` (method:
 * `opencode.sessionList`, handled server-side rather than chained onto this
 * command — chaining it here would require juggling exit codes to avoid
 * masking the run's own failure) and matches the tagged title to recover the
 * session id it was assigned, saving it for `--session <id>` resume on every
 * later run in this Arondo session.
 */
export class OpencodeAgent extends BaseAgent {
  readonly name = "opencode";

  getCommand({ sessionId, isResume, model }: Omit<AgentRunOptions, "onOutput">): string {
    const modelArg = model ? ` --model "${model}"` : "";
    const promptArg = `"$(< "$${PROMPT_ENV_VAR}")"`;
    const opencodeId = isResume && sessionId ? getOpencodeSessionIdSync(sessionId) : undefined;

    if (opencodeId) {
      return `opencode run${modelArg} --session "${opencodeId}" ${promptArg}`;
    }

    const titleArg = sessionId ? ` --title "${titleFor(sessionId)}"` : "";
    return `opencode run${modelArg}${titleArg} ${promptArg}`;
  }
}
