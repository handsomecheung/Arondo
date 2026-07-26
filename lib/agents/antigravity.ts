import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";
import { getAgentSessionId, getAgentSessionIdSync, saveAgentSessionId } from "./sessionMap";

function getAgySessionIdSync(sessionId: string): string | undefined {
  return getAgentSessionIdSync("agy", sessionId);
}

export async function getAgySessionId(sessionId: string): Promise<string | undefined> {
  return getAgentSessionId("agy", sessionId);
}

export async function saveAgySessionId(sessionId: string, agyId: string): Promise<void> {
  try {
    await saveAgentSessionId("agy", sessionId, agyId);
  } catch (err) {
    console.error("Failed to save agy session mapping:", err);
  }
}

/**
 * Adapter for Antigravity (agy).
 */
export class AntigravityAgent extends BaseAgent {
  readonly name = "antigravity";

  getCommand({ repoPath, sessionId, model }: Omit<AgentRunOptions, "onOutput">): string {
    const addDirArg = repoPath ? ` --add-dir "${repoPath}"` : "";
    const modelArg = model ? ` --model "${model}"` : "";
    if (sessionId) {
      const agyId = getAgySessionIdSync(sessionId);
      if (agyId) {
        return `agy --conversation "${agyId}" --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg}${modelArg} --dangerously-skip-permissions`;
      }
    }
    return `agy --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg}${modelArg} --dangerously-skip-permissions`;
  }
}
