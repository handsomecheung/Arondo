import { BaseAgent } from "./base";
import { AntigravityAgent } from "./antigravity";
import { ClaudeCodeAgent } from "./claude";
import { CodexAgent } from "./codex";

export type AgentType = "antigravity" | "claude" | "codex";

/**
 * Registry entry: maps an agent type to its factory and the binary name
 * that should be discoverable on the runner's PATH.
 */
interface AgentEntry {
  factory: () => BaseAgent;
  /** Binary name to look up via `which` / exec.LookPath on the runner */
  binary: string;
}

const AGENTS: Record<AgentType, AgentEntry> = {
  antigravity: { factory: () => new AntigravityAgent(), binary: "agy" },
  claude:      { factory: () => new ClaudeCodeAgent(),  binary: "claude" },
  codex:       { factory: () => new CodexAgent(),       binary: "codex" },
};

/**
 * Factory to get an agent by type name.
 * To add a new agent: implement BaseAgent, add it to the AGENTS map above.
 */
export function getAgent(type: AgentType): BaseAgent {
  const entry = AGENTS[type];
  if (!entry) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENTS).join(", ")}`);
  }
  return entry.factory();
}

export function getAvailableAgents(): AgentType[] {
  return Object.keys(AGENTS) as AgentType[];
}

/**
 * Returns the list of binary names the server wants runners to detect.
 * Sent to runners as `queryAgents` in the `connected` event so that
 * runners never need to hard-code agent names.
 */
export function getAgentBinaryNames(): string[] {
  return Object.values(AGENTS).map((e) => e.binary);
}

export { BaseAgent } from "./base";
export type { AgentRunOptions, AgentResult } from "./base";
