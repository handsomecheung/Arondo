import type { ConcreteAgentType } from "../../agents";

export type AutoModelProvider = "openai" | "google" | "anthropic";
export const MODEL_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type AutoModelEffort = (typeof MODEL_EFFORTS)[number];
export type AutoModelTaskClass = "question" | "small_change" | "debug" | "review" | "large_change";
export type AutoModelCostTier = "cheap" | "standard" | "strong";

export interface AutoModelOption {
  id: string;
  model?: string;
  effort?: AutoModelEffort;
  costTier: AutoModelCostTier;
  description: string;
}

export interface AutoModelDecision {
  model?: string;
  effort?: AutoModelEffort;
  taskClass: AutoModelTaskClass;
  costTier: AutoModelCostTier;
  confidence: number;
  reason: string;
}

export interface AutoModelInput {
  agentType: ConcreteAgentType;
  message: string;
  defaultModel?: string;
  modelOptions: AutoModelOption[];
  once?: boolean;
  effortOnly?: boolean;
  previousEffort?: AutoModelEffort;
  context?: string;
}
