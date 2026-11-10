import type { AutoModelOption } from "./types";

// Verified against OpenCode's /api/model Go catalog. Other providers require explicit variants.
const GO_VARIANTS: Record<string, readonly string[]> = {
  // A none -> graded effort transition can send an invalid top-level effort on resumed Anthropic requests.
  "claude-haiku-5-5": ["low", "medium", "high", "xhigh", "max"],
  "deepseek-v4-pro": ["high", "max"],
  "deepseek-v4.1-flash": ["low", "high", "max"],
  "gemini-4-argon": ["low", "medium", "high"],
  "glm-5.2": ["high", "max"],
  "glm-5.3": ["low", "high", "max"],
  "glm-5.3-flash": ["low", "high", "max"],
  "gpt-5.6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "grok-4.7": ["low", "medium", "high", "xhigh"],
  "hy3": ["none", "low", "high"],
  "hy4-preview": ["none", "high"],
  "kimi-k3": ["max"],
  "kimi-k3.1-pro": ["low", "high", "max"],
  "minimax-m3": ["none", "thinking"],
  "minimax-m3.1-flash": ["low", "medium", "high", "xhigh", "max"],
  "muse-spark-1.2-contributor": ["minimal", "low", "medium", "high", "xhigh"],
  "muse-spark-1.3-contributor": ["minimal", "low", "medium", "high", "xhigh"],
  "qwen3.7-plus": ["none", "high", "max"],
  "qwen3.8-flash": ["none", "low", "medium", "xhigh"],
  "qwen3.8-max": ["none", "low", "medium", "xhigh"],
  "step-5-preview": ["low", "medium", "high"],
  "beam-free": ["low", "medium", "high", "xhigh", "max"],
  "crouton-alpha-free": ["minimal", "low", "medium", "high", "xhigh", "max"],
};

export function getOpencodeNativeVariants(model: string): AutoModelOption[] {
  const family = model.split("#")[0];
  if (!family.startsWith("opencode-go/")) return [];
  return (GO_VARIANTS[family.slice("opencode-go/".length)] ?? []).map((variant) => ({
    id: `${family}-${variant}`.replace(/[^a-z0-9-]+/g, "-"),
    model: `${family}#${variant}`,
    costTier: ["none", "minimal", "low"].includes(variant) ? "cheap" : variant === "medium" ? "standard" : "strong",
    description: variant === "none"
      ? `${family}: thinking disabled for simple tasks`
      : variant === "thinking"
        ? `${family}: adaptive thinking enabled for complex tasks`
        : `${family}: ${variant} reasoning effort`,
  }));
}

export function expandOpencodeVariants(options: AutoModelOption[]): AutoModelOption[] {
  return options.flatMap((option) => {
    if (!option.model || option.model.includes("#")) return [option];
    if (options.some((candidate) => candidate.model?.startsWith(`${option.model}#`))) return [option];
    const variants = getOpencodeNativeVariants(option.model);
    return variants.length > 0 ? variants : [option];
  });
}
