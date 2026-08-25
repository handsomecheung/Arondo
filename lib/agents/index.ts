import { BaseAgent } from "./base";
import { AntigravityAgent } from "./antigravity";
import { ClaudeCodeAgent } from "./claude";
import { CodexAgent } from "./codex";
import { OpencodeAgent } from "./opencode";
import { selectAgent } from "../autoagent";
import { routeModel, type AutoModelEffort, type AutoModelOption } from "../automodel";

export type ConcreteAgentType = "antigravity" | "claude" | "codex" | "opencode";
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
  opencode:    { factory: () => new OpencodeAgent(),    binary: "opencode" },
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
  effort?: AutoModelEffort;
  modelOptions?: AutoModelOption[];
}

interface ResolveAgentOptions {
  prompt?: string;
}

/**
 * Resolves "auto" to a concrete AgentType by running the quota-based selection
 * algorithm against the agents installed on the given runner.
 * Non-"auto" types are returned unchanged.
 */
export async function resolveAgentType(
  agentType: string,
  runnerAgentBinaries: string[],
  options: ResolveAgentOptions = {},
): Promise<ResolvedAgent> {
  if (agentType !== "auto") return { agentType: agentType as ConcreteAgentType };
  const resolved = await selectAgent(runnerAgentBinaries);
  const selected = resolved ?? { agentType: "antigravity" as ConcreteAgentType };
  const routed = options.prompt && selected.modelOptions
    ? await routeModel({
      agentType: selected.agentType,
      message: options.prompt,
      defaultModel: selected.model,
      modelOptions: selected.modelOptions,
    })
    : null;
  if (!routed) return selected;
  return {
    agentType: selected.agentType,
    model: routed.model ?? selected.model,
    effort: routed.effort,
  };
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
