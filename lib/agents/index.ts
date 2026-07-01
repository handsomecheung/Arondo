import { BaseAgent } from "./base";
import { AntigravityAgent } from "./antigravity";
import { ClaudeCodeAgent } from "./claude";
import { CodexAgent } from "./codex";
import { selectAgent } from "../autoselect";

export type ConcreteAgentType = "antigravity" | "claude" | "codex";
export type AgentType = ConcreteAgentType | "auto";

/**
 * Registry entry: maps an agent type to its factory and the binary name
 * that should be discoverable on the runner's PATH.
 */
interface AgentEntry {
  factory: () => BaseAgent;
  /** Binary name to look up via `which` / exec.LookPath on the runner */
  binary: string;
}

const AGENTS: Record<ConcreteAgentType, AgentEntry> = {
  antigravity: { factory: () => new AntigravityAgent(), binary: "agy" },
  claude:      { factory: () => new ClaudeCodeAgent(),  binary: "claude" },
  codex:       { factory: () => new CodexAgent(),       binary: "codex" },
};

/**
 * Factory to get an agent by type name.
 * To add a new agent: implement BaseAgent, add it to the AGENTS map above.
 */
export function getAgent(type: ConcreteAgentType): BaseAgent {
  const entry = AGENTS[type];
  if (!entry) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENTS).join(", ")}`);
  }
  return entry.factory();
}

export function getAvailableAgents(): ConcreteAgentType[] {
  return Object.keys(AGENTS) as ConcreteAgentType[];
}

export interface ResolvedAgent {
  agentType: ConcreteAgentType;
  model?: string;
}

/**
 * Resolves "auto" to a concrete AgentType by running the quota-based selection
 * algorithm against the agents installed on the given runner.
 * Non-"auto" types are returned unchanged.
 */
export async function resolveAgentType(
  agentType: string,
  runnerAgentBinaries: string[],
): Promise<ResolvedAgent> {
  if (agentType !== "auto") return { agentType: agentType as ConcreteAgentType };
  const resolved = await selectAgent(runnerAgentBinaries);
  return resolved ?? { agentType: "antigravity" };
}

/**
 * Returns the list of binary names the server wants runners to detect.
 * Sent to runners as `queryAgents` in the `connected` event so that
 * runners never need to hard-code agent names.
 */
export function getAgentBinaryNames(): string[] {
  return Object.values(AGENTS).map((e) => e.binary);
}

export { BaseAgent, PROMPT_ENV_VAR } from "./base";
export type { AgentRunOptions } from "./base";
