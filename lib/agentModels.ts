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
  opencode?: AgentModelConfig;
}

export const DEFAULT_AGENT_MODELS: AgentModelsConfig & { opencode: AgentModelConfig } = {
  opencode: {
    defaultModel: "opencode-go/minimax-m3",
    availableModels: [
      "opencode-go/beam-free # Free for a limited time and in limited regions; 1M context; adjustable reasoning",
      "opencode-go/claude-haiku-5-5 # Image and PDF input; 1M context; optional adaptive thinking",
      "opencode-go/deepseek-v4-pro # Text-only; 1M context; high/max reasoning; requires Global region access",
      "opencode-go/deepseek-v4.1-flash # Image input; 1M context; low/high/max reasoning; requires Global region access",
      "opencode-go/gemini-4-argon # Image, video, audio and PDF input; 1M context; low/medium/high thinking",
      "opencode-go/glm-5.2 # Text-only; 1M context; high/max reasoning",
      "opencode-go/glm-5.3 # Text-only; 1M context; low/high/max reasoning",
      "opencode-go/glm-5.3-flash # Image and video input; 1M context; low/high/max reasoning",
      "opencode-go/gpt-5.6-luna # Image and PDF input; 1.05M context; reasoning from none to max",
      "opencode-go/gpt-6-luna # Image and PDF input; 1.05M context; reasoning from none to max; lower token prices than 5.6 Luna",
      "opencode-go/grok-4.7 # Image and PDF input; 500K context; up to 500K output; adjustable reasoning",
      "opencode-go/hy3 # Text-only; 256K context; none/low/high reasoning",
      "opencode-go/hy4-preview # Preview; text-only; 1.024M context; none/high reasoning",
      "opencode-go/iceman-contributor-free # Free for a limited time; text-only; 262K context; no named reasoning variants",
      "opencode-go/kimi-k2.7-code # Image and video input; 262K context and output; no named reasoning variants",
      "opencode-go/kimi-k3 # Image and video input; 1M context; max reasoning variant",
      "opencode-go/kimi-k3.1-pro # Image and video input; 1M context; low/high/max reasoning",
      "opencode-go/longcat-2.0 # Text-only; 1M context; no named reasoning variants",
      "opencode-go/mimo-v2.5 # Image, audio and video input; 1M context; no named reasoning variants",
      "opencode-go/mimo-v2.5-pro # Text-only; 1M context; no named reasoning variants",
      "opencode-go/mimo-v2.6-flash # Image, audio and video input; 1M context; no named reasoning variants",
      "opencode-go/mimo-v2.6-pro # Image, audio and video input; 1M context; no named reasoning variants",
      "opencode-go/minimax-m3 # Image and video input; 1M context; thinking can be enabled or disabled",
      "opencode-go/minimax-m3.1-flash # Image and video input; 1M context; up to 512K output; adjustable reasoning",
      "opencode-go/muse-spark-1.2-contributor # Image, video, PDF and audio input; 1M context; requires permission for paid endpoints that train on request data",
      "opencode-go/muse-spark-1.3-contributor # Image, video, PDF and audio input; 1M context; requires permission for paid endpoints that train on request data",
      "opencode-go/qwen3.7-plus # Image and video input; 1M context; optional thinking with high/max budgets",
      "opencode-go/qwen3.8-flash # Image and video input; 1M context; optional adaptive thinking; lower token prices than 3.8 Max",
      "opencode-go/qwen3.8-max # Image and video input; 1M context; optional adaptive thinking",
      "opencode-go/step-5-preview # Preview; image and video input; 1M context; low/medium/high reasoning",
    ],
  },
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

// OpenCode uses an attached #variant; comments must start after whitespace.
export function parseOpencodeModelLine(line?: string | null): string | null {
  return line?.replace(/(^|\s)#.*$/, "").trim() || null;
}

export function parseOpencodeModelList(models?: string[]): string[] {
  return (models ?? []).map(parseOpencodeModelLine).filter((model): model is string => model !== null);
}
