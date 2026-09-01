export interface AgentModelConfig {
  defaultModel?: string;
  availableModels?: string[];
}

export interface AntigravityModelsConfig {
  gemini: AgentModelConfig;
  other: AgentModelConfig;
}

export interface AgentModelsConfig {
  antigravity: AntigravityModelsConfig;
  claude: AgentModelConfig;
  codex: AgentModelConfig;
}

export const DEFAULT_AGENT_MODELS: AgentModelsConfig = {
  antigravity: {
    gemini: {
      defaultModel: "Gemini 3.7 Flash (Medium)",
      availableModels: [
        "Gemini 3.7 Flash (High) # Best for complex tasks and deep reasoning",
        "Gemini 3.7 Flash (Medium) # Default recommended for everyday coding",
        "Gemini 3.7 Flash (Low) # Fast and responsive for small tasks",
        "Gemini 3.6 Flash (High) # Solid reasoning performance",
        "Gemini 3.6 Flash (Medium) # Balanced option · Reliable daily driver",
        "Gemini 3.6 Flash (Low) # Fast and lightweight for simple requests",
        "Gemini 3.1 Pro (High) # Deep reasoning for complex architectural work",
        "Gemini 3.1 Pro (Low) # Moderate reasoning for general tasks",
      ],
    },
    other: {
      defaultModel: "Claude Sonnet 4.6 (Thinking)",
      availableModels: [
        "Claude Sonnet 4.6 (Thinking) # Strong general coding model in Antigravity",
        "Claude Opus 4.6 (Thinking) # Highest capability for the hardest tasks",
        "# GPT-OSS 120B (Medium) # Open-source 120B model · Coding performance may be suboptimal; remove '#' to enable",
      ],
    },
  },
  claude: {
    defaultModel: "opus",
    availableModels: [
      "opus # Opus 5 with 1M context · Best for everyday, complex tasks · $5/$25 per Mtok",
      "fable # Fable 5 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok",
      "sonnet # Sonnet 5 · Efficient for routine tasks · $2/$10 per Mtok",
      "haiku # Haiku 4.5 · Fastest for quick answers · $1/$5 per Mtok",
    ],
  },
  codex: {
    defaultModel: "gpt-5.6-terra",
    availableModels: [
      "gpt-5.6-sol # Flagship reasoning model · Best for complex reasoning and architecture",
      "gpt-5.6-terra # Balanced default model · Everyday coding and refactoring",
      "gpt-5.6-luna # Fast and lightweight · Quick edits and simple tasks",
      "gpt-5.5 # Standard general-purpose coding model",
      "gpt-5.4 # Previous generation general coding model",
      "gpt-5.4-mini # Lightweight low-cost option for small tasks",
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
