import type { ConcreteAgentType } from "../agents";

export type MRouterProvider = "openai" | "google" | "anthropic";
export type MRouterEffort = "minimal" | "low" | "medium" | "high";
export type MRouterTaskClass = "question" | "small_change" | "debug" | "review" | "large_change";
export type MRouterCostTier = "cheap" | "standard" | "strong";

export interface MRouterModelOption {
  id: string;
  model?: string;
  effort?: MRouterEffort;
  costTier: MRouterCostTier;
  description: string;
}

export interface MRouterDecision {
  model?: string;
  effort?: MRouterEffort;
  taskClass: MRouterTaskClass;
  costTier: MRouterCostTier;
  confidence: number;
  reason: string;
}

export interface MRouterInput {
  agentType: ConcreteAgentType;
  message: string;
  defaultModel?: string;
  modelOptions: MRouterModelOption[];
}
