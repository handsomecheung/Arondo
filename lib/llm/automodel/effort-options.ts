import type { ConcreteAgentType } from "../../agents";
import { MODEL_EFFORTS, type AutoModelEffort, type AutoModelOption } from "./types";
import { getOpencodeNativeVariants } from "./opencode-variants";

const CODEX_EFFORT_MODELS = new Set([
  "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna",
  "gpt-6-chat-thinking", "gpt-reserve", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
]);

export function splitCodexModel(model: string): { model: string; effort?: AutoModelEffort } {
  const parts = model.trim().split(/\s+/);
  const last = parts.at(-1)?.toLowerCase();
  if (parts.length > 1 && MODEL_EFFORTS.some((effort) => effort === last)) {
    return { model: parts.slice(0, -1).join(" "), effort: last as AutoModelEffort };
  }
  return { model: model.trim() };
}

export function getModelFamily(agent: ConcreteAgentType, model?: string): string | undefined {
  if (!model) return undefined;
  if (agent === "claude" || agent === "codex" || agent === "pi") return splitCodexModel(model).model;
  if (agent === "antigravity") return model.replace(/\s+\((Low|Medium|High|XHigh|Max)\)$/i, "");
  if (agent === "opencode") return model.split("#")[0];
  return model;
}

function nativeEfforts(agent: ConcreteAgentType, model: string): AutoModelEffort[] {
  if (agent === "codex") {
    if (CODEX_EFFORT_MODELS.has(model)) {
      // Ultra also changes task delegation, rather than reasoning effort alone.
      return ["low", "medium", "high", "xhigh", "max"];
    }
  }
  if (agent === "claude") {
    if (/^(?:opus|sonnet|haiku|fable)$/.test(model)
      || /^(?:claude-)?(?:opus|sonnet)-5(?:[.-]5)?(?:-\d{8})?$/.test(model)
      || /^(?:claude-)?haiku-5[.-]5(?:-\d{8})?$/.test(model)
      || /^(?:claude-)?fable-5(?:[.-]1)?(?:-\d{8})?$/.test(model)
      || /^(?:claude-)?opus-4[.-][78](?:-\d{8})?$/.test(model)) {
      return ["low", "medium", "high", "xhigh", "max"];
    }
    if (/^(?:claude-)?(?:opus|sonnet)-4[.-]6(?:-\d{8})?$/.test(model)) {
      return ["low", "medium", "high", "max"];
    }
  }
  if (agent === "pi") {
    return ["low", "medium", "high", "xhigh", "max"];
  }
  return [];
}

export function getEffortOptions(
  agent: ConcreteAgentType,
  model: string | undefined,
  options: AutoModelOption[],
): AutoModelOption[] {
  if (!model) return [];
  const family = getModelFamily(agent, model);
  const matching = options.filter((option) => option.model && getModelFamily(agent, option.model) === family);
  if (agent === "antigravity" || agent === "opencode") {
    const variants = matching.filter((option) => agent === "antigravity"
      ? /\s+\((Low|Medium|High|XHigh|Max)\)$/i.test(option.model!)
      : option.model!.includes("#"));
    if (variants.length > 0 || agent === "antigravity") {
      return [...new Map(variants.map((option) => [option.model, option])).values()];
    }
    return getOpencodeNativeVariants(model);
  }
  const explicit = matching.filter((option) => option.effort);
  if (explicit.length > 0) return explicit;
  return nativeEfforts(agent, family!).map((effort) => ({
    id: `${agent}-${family}-${effort}`,
    model: family,
    effort,
    costTier: effort === "low" ? "cheap" : effort === "medium" ? "standard" : "strong",
    description: `${family} with ${effort} reasoning effort`,
  }));
}
