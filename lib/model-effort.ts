import { getEffortOptions, getModelFamily, splitCodexModel } from "./llm/automodel/effort-options";
import type { AutoModelOption } from "./llm/automodel/types";
import { DEFAULT_AGENT_MODELS, getOpencodeModelGroups, parseModelLine, parseModelList, parseOpencodeModelLine, parseOpencodeModelList, type AgentModelsConfig } from "./agentModels";

export const EFFORT_AGENTS = ["antigravity", "claude", "codex", "opencode", "pi"] as const;
export type EffortAgent = (typeof EFFORT_AGENTS)[number];

export function isEffortAgent(agent: string): agent is EffortAgent {
  return (EFFORT_AGENTS as readonly string[]).includes(agent);
}

export interface EffortChoice {
  label: string;
  model: string;
}

const ANTIGRAVITY_EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"];

function configuredModelLines(agent: EffortAgent, config?: AgentModelsConfig | null): string[] {
  if (agent === "antigravity") {
    const agy = config?.antigravity ?? DEFAULT_AGENT_MODELS.antigravity;
    return [agy.gemini, agy.other, agy.argon].flatMap((group) => parseModelList(group?.availableModels ?? []));
  }
  if (agent === "opencode") {
    return getOpencodeModelGroups(config?.opencode).flatMap((group) => parseOpencodeModelList(group.models));
  }
  return parseModelList(config?.[agent]?.availableModels ?? DEFAULT_AGENT_MODELS[agent]?.availableModels ?? []);
}

function toOptions(agent: EffortAgent, lines: string[]): AutoModelOption[] {
  return lines.map((model): AutoModelOption => ({
    id: model,
    ...(agent === "claude" || agent === "codex" || agent === "pi" ? splitCodexModel(model) : { model }),
    costTier: "standard",
    description: model,
  }));
}

function effortLabel(agent: EffortAgent, option: AutoModelOption): string {
  if (agent === "antigravity") return option.model!.match(/\(([^)]+)\)$/)?.[1] ?? option.model!;
  if (agent === "opencode") return option.model!.split("#")[1] ?? "";
  return option.effort!;
}

/** Mirrors the server fallback: an unset model uses the configured default (Antigravity: Gemini group). */
export function getEffectiveModel(agent: string, model: string | undefined, config?: AgentModelsConfig | null): string {
  if (model) return model;
  if (!isEffortAgent(agent)) return "";
  const defaults = config ?? DEFAULT_AGENT_MODELS;
  if (agent === "antigravity") return parseModelLine(defaults.antigravity?.gemini?.defaultModel) ?? "";
  if (agent === "opencode") return parseOpencodeModelLine(defaults.opencode?.defaultModel) ?? "";
  return parseModelLine(defaults[agent]?.defaultModel) ?? "";
}

/** Splits a model string into its family, e.g. "Gemini 3.8 Flash (High)" -> "Gemini 3.8 Flash". */
export function modelFamilyOf(agent: string, model: string): string {
  return isEffortAgent(agent) ? getModelFamily(agent, model) ?? "" : model;
}

/**
 * Effort options for a model family. Each choice's `model` is the full string to submit;
 * Antigravity and OpenCode embed the effort in the model name, others use "<model> <effort>".
 */
export function getEffortChoices(agent: EffortAgent, model: string, config?: AgentModelsConfig | null): EffortChoice[] {
  const family = getModelFamily(agent, model);
  if (!family) return [];
  const options = getEffortOptions(agent, family, toOptions(agent, configuredModelLines(agent, config)));
  const choices = options.map((option) => ({
    label: effortLabel(agent, option),
    model: agent === "antigravity" || agent === "opencode"
      ? option.model!
      : option.effort ? `${family} ${option.effort}` : family,
  }));
  if (agent === "antigravity") {
    return choices.sort((a, b) => ANTIGRAVITY_EFFORT_ORDER.indexOf(a.label.toLowerCase()) - ANTIGRAVITY_EFFORT_ORDER.indexOf(b.label.toLowerCase()));
  }
  if (choices.length === 0) return choices;
  return [{ label: "Default", model: family }, ...choices];
}

/** Full model string to submit when a family is picked; Antigravity defaults to Medium. */
export function getFamilyDefaultModel(agent: string, family: string, config?: AgentModelsConfig | null): string {
  if (agent !== "antigravity") return family;
  const choices = getEffortChoices(agent, family, config);
  return (choices.find((choice) => choice.label === "Medium") ?? choices[0])?.model ?? family;
}
