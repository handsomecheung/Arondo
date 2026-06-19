import { BaseAgent } from "./base";
import { GeminiAgent } from "./gemini";
import { AntigravityAgent } from "./antigravity";

export type AgentType = "gemini" | "antigravity";

const AGENTS: Record<AgentType, () => BaseAgent> = {
  gemini: () => new GeminiAgent(),
  antigravity: () => new AntigravityAgent(),
};

/**
 * Factory to get an agent by type name.
 * To add a new agent: implement BaseAgent, add it to the AGENTS map above.
 */
export function getAgent(type: AgentType): BaseAgent {
  const factory = AGENTS[type];
  if (!factory) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENTS).join(", ")}`);
  }
  return factory();
}

export function getAvailableAgents(): AgentType[] {
  return Object.keys(AGENTS) as AgentType[];
}

export { BaseAgent } from "./base";
export type { AgentRunOptions, AgentResult } from "./base";
