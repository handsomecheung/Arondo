export interface AgentModelConfig {
  defaultModel?: string;
  availableModels?: string[];
}

export interface AntigravityModelsConfig {
  gemini: AgentModelConfig;
  other: AgentModelConfig;
  argon?: AgentModelConfig;
}

export interface AgentModelsConfig {
  antigravity: AntigravityModelsConfig;
  claude: AgentModelConfig;
  codex: AgentModelConfig;
}

export const DEFAULT_AGENT_MODELS: AgentModelsConfig = {
  antigravity: {
    gemini: {
      defaultModel: "Gemini 3.8 Flash (Medium)",
      availableModels: [
        "Gemini 3.8 Flash (High)",
        "Gemini 3.8 Flash (Medium)",
        "Gemini 3.8 Flash (Low)",
      ],
    },
    other: {
      defaultModel: "Claude Sonnet 5.5 (Medium)",
      availableModels: [
        "Claude Opus 5.5 (Low)",
        "Claude Opus 5.5 (Medium)",
        "Claude Opus 5.5 (High)",
        "Claude Sonnet 5.5 (Low)",
        "Claude Sonnet 5.5 (Medium)",
        "Claude Sonnet 5.5 (High)",
        "GPT-OSS 120B (Medium)",
      ],
    },
    argon: {
      defaultModel: "Gemini 4 Argon (Medium)",
      availableModels: [
        "Gemini 4 Argon (High) # Best for complex tasks with deep reasoning in Gemini 4",
        "Gemini 4 Argon (Medium) # Default recommended Argon model",
        "Gemini 4 Argon (Low) # Fast and lightweight for simple requests",
      ],
    },
  },
  claude: {
    defaultModel: "opus",
    availableModels: [
      "opus # Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok",
      "fable # Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok",
      "sonnet # Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok",
      "haiku # Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok ($0.50/$2.50 for prompts over 100k)",
    ],
  },
  codex: {
    defaultModel: "gpt-6-sol",
    availableModels: [
      "gpt-6.1-sol # Latest workhorse model for coding and everyday work.",
      "gpt-6-astra # Frontier intelligence for the most demanding work.",
      "gpt-6-sol # Previous generation workhorse model.",
      "gpt-6-luna # Fast and affordable model for easier tasks.",
      "gpt-5.6-sol # Older generation workhorse model.",
      "gpt-5.6-terra # Older balanced model for straightforward work.",
      "gpt-5.6-luna # Older fast and efficient model.",
    ],
  },
};

/**
 * Returns a fresh copy of the default agent models configuration.
 */
export function getDefaultAgentModels(): AgentModelsConfig {
  return JSON.parse(JSON.stringify(DEFAULT_AGENT_MODELS));
}

/**
 * Parses a single model name string, stripping comments starting with `#`,
 * trimming whitespace, and returning null if the result is empty.
 */
export function parseModelLine(line?: string | null): string | null {
  if (!line) return null;
  const hashIdx = line.indexOf("#");
  const cleaned = (hashIdx >= 0 ? line.slice(0, hashIdx) : line).trim();
  return cleaned || null;
}

/**
 * Parses an array of model lines, removing comment lines, inline comments,
 * and empty entries.
 */
export function parseModelList(models?: string[] | null): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => parseModelLine(m))
    .filter((m): m is string => m !== null);
}
