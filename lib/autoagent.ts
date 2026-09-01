import fs from "fs/promises";
import path from "path";
import type { ConcreteAgentType } from "./agents/index";
import { getSessionLog, getAgentModelsConfig, getDefaultAgentModels, parseModelLine, parseModelList, type AgentModelsConfig } from "./store";
import { getConfigDir } from "./config";
import { stripAnsi } from "./ansi";
import type { AutoModelCostTier, AutoModelEffort, AutoModelOption } from "./automodel";

const CONFIG_DIR = getConfigDir();

const QUOTA_PATH = path.join(CONFIG_DIR, "autoagent", "agent", "quota.json");

export interface ResolvedAgent {
  agentType: ConcreteAgentType;
  model?: string;
  effort?: AutoModelEffort;
  modelOptions?: AutoModelOption[];
  agyQuotaGroup?: AgyQuotaGroup;
}

export type AgyQuotaGroup = "gemini" | "other";

interface ClaudeQuota {
  Type: "claude";
  Plan: string;
  Account: string;
  DefaultModel: string;
  HourRemain: number | null;
  HourResetAt: number | null;
  WeekRemain: number | null;
  WeekResetsAt: number | null;
  updatedAt: number | null;
  IsAPIKey?: boolean;
}

interface AntigravityQuota {
  Type: "antigravity";
  Plan: string;
  Account: string;
  DefaultModel: string;
  GeminiWeeklyRemain: number | null;
  GeminiWeeklyResetsAt: number | null;
  GeminiHourRemain: number | null;
  GeminiHourResetsAt: number | null;
  OtherWeeklyRemain: number | null;
  OtherWeeklyResetsAt: number | null;
  OtherHourRemain: number | null;
  OtherHourResetsAt: number | null;
  updatedAt: number | null;
  IsAPIKey?: boolean;
}

interface CodexQuota {
  Type: "codex";
  Plan: string;
  Account: string;
  DefaultModel: string;
  WeeklyRemain: number | null;
  WeeklyResetAt: number | null;
  updatedAt: number | null;
  IsAPIKey?: boolean;
}

type QuotaEntry = ClaudeQuota | AntigravityQuota | CodexQuota;

async function readQuota(): Promise<Record<string, QuotaEntry>> {
  try {
    const raw = await fs.readFile(QUOTA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

interface AgentChoice {
  id: "A" | "B" | "C" | "D";
  agentType: ConcreteAgentType;
  model?: string;
  modelOptions: AutoModelOption[];
  agyQuotaGroup?: AgyQuotaGroup;
}

const PREDEFINED_MODEL_OPTIONS: Record<string, Omit<AutoModelOption, "model">> = {
  "Gemini 3.7 Flash (High)": { id: "gemini-3.7-flash-high", costTier: "standard", description: "Gemini Flash 3.7 with high thinking for harder work." },
  "Gemini 3.7 Flash (Medium)": { id: "gemini-3.7-flash-medium", costTier: "standard", description: "Gemini Flash 3.7 balanced option." },
  "Gemini 3.7 Flash (Low)": { id: "gemini-3.7-flash-low", costTier: "cheap", description: "Gemini Flash 3.7 low thinking for small tasks." },
  "Gemini 3.6 Flash (High)": { id: "gemini-3.6-flash-high", costTier: "standard", description: "Gemini Flash 3.6 with high thinking." },
  "Gemini 3.6 Flash (Medium)": { id: "gemini-3.6-flash-medium", costTier: "standard", description: "Gemini Flash 3.6 balanced option." },
  "Gemini 3.6 Flash (Low)": { id: "gemini-3.6-flash-low", costTier: "cheap", description: "Gemini Flash 3.6 low thinking for small tasks." },
  "Gemini 3.5 Flash (High)": { id: "gemini-3.5-flash-high", costTier: "standard", description: "Gemini Flash 3.5 with high thinking." },
  "Gemini 3.5 Flash (Medium)": { id: "gemini-3.5-flash-medium", costTier: "cheap", description: "Gemini Flash 3.5 balanced low-cost option." },
  "Gemini 3.5 Flash (Low)": { id: "gemini-3.5-flash-low", costTier: "cheap", description: "Cheapest Gemini Flash option for simple requests." },
  "Gemini 3.1 Pro (High)": { id: "gemini-3.1-pro-high", costTier: "strong", description: "Gemini Pro with high thinking for complex work." },
  "Gemini 3.1 Pro (Low)": { id: "gemini-3.1-pro-low", costTier: "standard", description: "Gemini Pro with low thinking for moderate work." },
  "Claude Sonnet 4.6 (Thinking)": { id: "claude-sonnet-4-6", costTier: "strong", description: "Strong general coding model in Antigravity." },
  "Claude Opus 4.6 (Thinking)": { id: "claude-opus-4-6-thinking", costTier: "strong", description: "Highest-cost Antigravity model for the hardest tasks." },
  "GPT-OSS 120B (Medium)": { id: "gpt-oss-120b-medium", costTier: "cheap", description: "Open-source model in Antigravity. May have suboptimal coding performance." },
  "gpt-5.4-mini low": { id: "codex-gpt-5.4-mini-low", effort: "low", costTier: "cheap", description: "Cheaper Codex option for small questions and low-risk changes." },
  "gpt-5.5 medium": { id: "codex-gpt-5.5-medium", effort: "medium", costTier: "standard", description: "Default Codex option for normal coding tasks." },
  "gpt-5.5 high": { id: "codex-gpt-5.5-high", effort: "high", costTier: "strong", description: "Stronger Codex reasoning for hard debugging and broad changes." },
};

const CLAUDE_DEFAULT_OPTION: AutoModelOption = {
  id: "claude-default",
  costTier: "standard",
  description: "Use Claude Code's configured default model.",
};

export function buildModelOption(modelStr: string, agentType: ConcreteAgentType): AutoModelOption {
  const predefined = PREDEFINED_MODEL_OPTIONS[modelStr];
  if (predefined) {
    if (agentType === "codex" && predefined.effort) {
      const modelName = modelStr.replace(/\s+(low|medium|high|minimal)$/i, "");
      return { ...predefined, model: modelName };
    }
    return { ...predefined, model: modelStr };
  }
  const slug = modelStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let effort: AutoModelEffort | undefined;
  let modelName = modelStr;
  if (agentType === "codex") {
    const parts = modelStr.trim().split(/\s+/);
    const last = parts[parts.length - 1]?.toLowerCase();
    if (["minimal", "low", "medium", "high"].includes(last)) {
      effort = last as AutoModelEffort;
      modelName = parts.slice(0, -1).join(" ");
    }
  }
  const lower = modelStr.toLowerCase();
  const costTier: AutoModelCostTier = (lower.includes("pro") || lower.includes("opus") || lower.includes("high") || lower.includes("max"))
    ? "strong"
    : (lower.includes("flash") || lower.includes("mini") || lower.includes("low") || lower.includes("haiku") || lower.includes("cheap"))
      ? "cheap"
      : "standard";

  return {
    id: `${agentType}-${slug || "model"}`,
    model: modelName,
    effort,
    costTier,
    description: modelStr,
  };
}

export function getModelOptionsForAgent(
  agentType: ConcreteAgentType,
  agyQuotaGroup?: AgyQuotaGroup,
  agentModels?: AgentModelsConfig,
): AutoModelOption[] {
  const configs = agentModels || getDefaultAgentModels();
  if (agentType === "antigravity") {
    const geminiModels = parseModelList(configs.antigravity?.gemini?.availableModels);
    const otherModels = parseModelList(configs.antigravity?.other?.availableModels);
    if (agyQuotaGroup === "gemini") {
      return geminiModels.map((m) => buildModelOption(m, "antigravity"));
    }
    if (agyQuotaGroup === "other") {
      return otherModels.map((m) => buildModelOption(m, "antigravity"));
    }
    return [
      ...geminiModels.map((m) => buildModelOption(m, "antigravity")),
      ...otherModels.map((m) => buildModelOption(m, "antigravity")),
    ];
  }
  if (agentType === "claude") {
    const models = parseModelList(configs.claude?.availableModels);
    if (models.length > 0) {
      return models.map((m) => buildModelOption(m, "claude"));
    }
    return [CLAUDE_DEFAULT_OPTION];
  }
  if (agentType === "codex") {
    const models = parseModelList(configs.codex?.availableModels);
    if (models.length > 0) {
      return models.map((m) => buildModelOption(m, "codex"));
    }
    return [
      buildModelOption("gpt-5.4-mini low", "codex"),
      buildModelOption("gpt-5.5 medium", "codex"),
      buildModelOption("gpt-5.5 high", "codex"),
    ];
  }
  return [];
}

export function getAgyQuotaGroupForModel(model?: string): AgyQuotaGroup | undefined {
  const cleaned = parseModelLine(model);
  if (!cleaned) return undefined;
  const lower = cleaned.toLowerCase();
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("gpt-oss") || lower.includes("claude") || lower.includes("opus") || lower.includes("sonnet")) return "other";
  return "gemini";
}

/**
 * Selects the best agent and model from the available binary names on a runner.
 */
export async function selectAgent(runnerAgentBinaries: string[]): Promise<ResolvedAgent | null> {
  const agentModels = await getAgentModelsConfig();
  const hasAgy = runnerAgentBinaries.includes("agy");
  const hasClaude = runnerAgentBinaries.includes("claude");
  const hasCodex = runnerAgentBinaries.includes("codex");

  // A: agy + Gemini models
  // B: agy + Other (Claude) models
  // C: claude
  // D: codex + gpt-5.5 (medium)
  const choices: AgentChoice[] = [];
  if (hasAgy) {
    const geminiOptions = getModelOptionsForAgent("antigravity", "gemini", agentModels);
    const otherOptions = getModelOptionsForAgent("antigravity", "other", agentModels);
    const agyDefault = parseModelLine(agentModels.antigravity?.gemini?.defaultModel) || geminiOptions[0]?.model || "Gemini 3.5 Flash (Medium)";
    const otherDefault = parseModelLine(agentModels.antigravity?.other?.defaultModel) || otherOptions[0]?.model || "Claude Sonnet 4.6 (Thinking)";

    choices.push({
      id: "A",
      agentType: "antigravity",
      model: agyDefault,
      modelOptions: geminiOptions,
      agyQuotaGroup: "gemini",
    });
    choices.push({
      id: "B",
      agentType: "antigravity",
      model: otherDefault,
      modelOptions: otherOptions,
      agyQuotaGroup: "other",
    });
  }
  if (hasClaude) {
    const claudeOptions = getModelOptionsForAgent("claude", undefined, agentModels);
    const claudeDefault = parseModelLine(agentModels.claude?.defaultModel) || claudeOptions[0]?.model || "claude-3-7-sonnet-20250219";
    choices.push({
      id: "C",
      agentType: "claude",
      model: claudeDefault,
      modelOptions: claudeOptions,
    });
  }
  if (hasCodex) {
    const codexOptions = getModelOptionsForAgent("codex", undefined, agentModels);
    const codexDefault = parseModelLine(agentModels.codex?.defaultModel) || "gpt-5.5 medium";
    choices.push({
      id: "D",
      agentType: "codex",
      model: codexDefault,
      modelOptions: codexOptions,
    });
  }

  console.log(`[autoagent] Available runner binaries: ${runnerAgentBinaries.join(", ")}`);
  console.log(`[autoagent] Initial choices: ${choices.map((c) => c.id).join(", ")}`);

  if (choices.length === 0) {
    console.log("[autoagent] No choices available.");
    return null;
  }
  if (choices.length === 1) {
    console.log(`[autoagent] Only one choice available: ${choices[0].id}. Selecting it directly.`);
    return {
      agentType: choices[0].agentType,
      model: choices[0].model,
      modelOptions: choices[0].modelOptions,
      agyQuotaGroup: choices[0].agyQuotaGroup,
    };
  }

  const quota = await readQuota();
  const entries = Object.values(quota);
  const latestEntryByType = new Map<QuotaEntry["Type"], QuotaEntry>();
  for (const entry of entries) {
    const existing = latestEntryByType.get(entry.Type);
    if (!existing || (entry.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      latestEntryByType.set(entry.Type, entry);
    }
  }

  // Helper to extract relevant quota metrics for a choice
  const getMetrics = (choice: AgentChoice) => {
    let hourRemain: number | null = null;
    let weekRemain: number | null = null;
    let resetsAt: number | null = null;

    if (choice.id === "A") {
      const q = latestEntryByType.get("antigravity") as AntigravityQuota | undefined;
      if (q) {
        hourRemain = q.GeminiHourRemain;
        weekRemain = q.GeminiWeeklyRemain;
        resetsAt = q.GeminiWeeklyResetsAt;
      }
    } else if (choice.id === "B") {
      const q = latestEntryByType.get("antigravity") as AntigravityQuota | undefined;
      if (q) {
        hourRemain = q.OtherHourRemain;
        weekRemain = q.OtherWeeklyRemain;
        resetsAt = q.OtherWeeklyResetsAt;
      }
    } else if (choice.id === "C") {
      const q = latestEntryByType.get("claude") as ClaudeQuota | undefined;
      if (q) {
        hourRemain = q.HourRemain;
        weekRemain = q.WeekRemain;
        resetsAt = q.WeekResetsAt;
      }
    } else if (choice.id === "D") {
      // Codex only reports a weekly limit; no hourly figure is available.
      const q = latestEntryByType.get("codex") as CodexQuota | undefined;
      if (q) {
        weekRemain = q.WeeklyRemain;
        resetsAt = q.WeeklyResetAt;
      }
    }

    const entry = choice.id === "A" || choice.id === "B"
      ? latestEntryByType.get("antigravity")
      : choice.id === "C"
        ? latestEntryByType.get("claude")
        : latestEntryByType.get("codex");
    return { hourRemain, weekRemain, resetsAt, isAPIKey: entry?.IsAPIKey === true };
  };

  for (const choice of choices) {
    const { hourRemain, weekRemain, resetsAt } = getMetrics(choice);
    console.log(
      `[autoagent] Choice ${choice.id} (${choice.agentType} / ${choice.model ?? "default"}): ` +
      `HourRemain=${hourRemain}, WeekRemain=${weekRemain}, ResetsAt=${resetsAt}`
    );
  }

  const knownQuotaChoices = choices.filter((choice) => {
    const { weekRemain, isAPIKey } = getMetrics(choice);
    return !isAPIKey && weekRemain !== null;
  });
  const unknownQuotaChoices = choices.filter((choice) => {
    const { weekRemain, isAPIKey } = getMetrics(choice);
    return !isAPIKey && weekRemain === null;
  });
  const apiKeyChoices = choices.filter((choice) => getMetrics(choice).isAPIKey);

  if (knownQuotaChoices.length === 0) {
    const fallbackChoices = unknownQuotaChoices.length > 0 ? unknownQuotaChoices : apiKeyChoices;
    console.log(`[autoagent] No known quota scores. Falling back to ${unknownQuotaChoices.length > 0 ? "unknown" : "API Key"} choices: [${fallbackChoices.map((c) => c.id).join(", ")}]`);
    const fallback = fallbackChoices[0];
    return {
      agentType: fallback.agentType,
      model: fallback.model,
      modelOptions: fallback.modelOptions,
      agyQuotaGroup: fallback.agyQuotaGroup,
    };
  }

  // Step 1: Filter known-quota choices where HourRemain < 0.15.
  const now = Math.floor(Date.now() / 1000);
  const lowQuotaChoices: AgentChoice[] = [];
  const normalChoices: AgentChoice[] = [];

  for (const choice of knownQuotaChoices) {
    const { hourRemain } = getMetrics(choice);
    if (hourRemain !== null && hourRemain < 0.15) {
      lowQuotaChoices.push(choice);
    } else {
      normalChoices.push(choice);
    }
  }

  console.log(
    `[autoagent] Step 1 Filter: Normal choices = [${normalChoices.map((c) => c.id).join(", ")}], ` +
    `Low quota choices (<0.15) = [${lowQuotaChoices.map((c) => c.id).join(", ")}]`
  );

  // Exception: if ALL available choices are low quota, keep them all in comparison
  let activeChoices = normalChoices;
  let excludedChoices = lowQuotaChoices;
  if (normalChoices.length === 0) {
    console.log("[autoagent] Exception: All choices are low quota. Keeping all choices in active list.");
    activeChoices = lowQuotaChoices;
    excludedChoices = [];
  }

  // Step 2: Score active choices based on WeekRemain and time passed in week
  const scoredChoices = activeChoices.map((choice) => {
    const { weekRemain, resetsAt } = getMetrics(choice);
    let weekTimeRemain = 0.0;

    if (resetsAt !== null) {
      // 1 week is 604,800 seconds
      weekTimeRemain = Math.max(0, Math.min(1, (resetsAt - now) / 604800));
    }

    const score = weekRemain! - weekTimeRemain;
    console.log(
      `[autoagent] Step 2 Scoring: Choice ${choice.id} -> ` +
      `WeekRemain=${weekRemain!.toFixed(3)}, WeekTimeRemain=${weekTimeRemain.toFixed(3)}, ` +
      `Score=${score.toFixed(3)} (Reset at ${resetsAt}, Current time ${now})`
    );
    return { choice, score };
  });

  // Sort active choices by score descending
  scoredChoices.sort((a, b) => b.score - a.score);

  const candidateAgents = [
    ...scoredChoices.map((sc) => sc.choice),
    ...excludedChoices,
  ];

  console.log(`[autoagent] Final Candidate Order: [${candidateAgents.map((c) => c.id).join(", ")}]`);

  const best = candidateAgents[0];
  console.log(`[autoagent] Selection Result: Choice ${best.id} (Agent: ${best.agentType}, Model: ${best.model ?? "default"})`);
  return {
    agentType: best.agentType,
    model: best.model,
    modelOptions: best.modelOptions,
    agyQuotaGroup: best.agyQuotaGroup,
  };
}

/**
 * Returns true if at least one agent (or the given one) has enough hourly
 * quota left to be worth trying. Mirrors the 0.15 threshold used by selectAgent.
 * No quota data at all is treated as "available" so we never block forever.
 */
export async function isQuotaAvailable(
  agentType?: ConcreteAgentType,
  agyQuotaGroup?: AgyQuotaGroup,
): Promise<boolean> {
  const quota = await readQuota();
  const entries = Object.values(quota);
  if (entries.length === 0) return true;

  const relevant = agentType ? entries.filter((e) => e.Type === agentType) : entries;
  if (relevant.length === 0) return true;

  for (const e of relevant) {
    if (e.Type === "claude") {
      if ((e.HourRemain ?? 1) >= 0.15) return true;
    } else if (e.Type === "antigravity") {
      if (agyQuotaGroup === "gemini" && (e.GeminiHourRemain ?? 1) >= 0.15) return true;
      if (agyQuotaGroup === "other" && (e.OtherHourRemain ?? 1) >= 0.15) return true;
      if (!agyQuotaGroup && ((e.GeminiHourRemain ?? 1) >= 0.15 || (e.OtherHourRemain ?? 1) >= 0.15)) return true;
    } else if (e.Type === "codex") {
      // No hourly figure reported for codex — treat as always available.
      return true;
    }
  }
  return false;
}

// ─── Cross-agent context injection ────────────────────────────────────────────

const AGENT_LABEL: Record<string, string> = {
  claude: "Claude Code",
  antigravity: "Antigravity CLI",
  codex: "Codex CLI",
};

/**
 * Builds a context string for cross-agent handoff in "auto" sessions.
 *
 * When the resolved agent differs from the agent used in the most recent
 * execution, the contiguous block of "foreign" exchanges is collected and
 * returned as a context prefix. Returns null when no handoff is needed.
 *
 * Example — given: chat1(agy), chat2(agy), [now switching to claude]
 *   → returns context block containing chat1+2 user messages + agy outputs
 *
 * Example — given: chat1(agy), chat2(agy), chat3(claude), chat4(claude), [switching back to agy]
 *   → returns context block containing chat3+4 only (chat1+2 covered by agy --resume)
 */
export async function buildCrossAgentContext(
  sessionId: string,
  currentAgentType: ConcreteAgentType,
  messages: Message[],
): Promise<string | null> {
  const agentRuns = messages.filter(
    (m) => m.type === "agent-run" && m.resolvedAgentType,
  );
  if (agentRuns.length === 0) return null;

  const lastRun = agentRuns[agentRuns.length - 1];
  const prevAgentType = lastRun.resolvedAgentType!;
  if (prevAgentType === currentAgentType) return null; // Same agent, no handoff needed.

  // Find the message index right after the last run of the SAME type as current.
  // That marks the start of the "foreign block" we need to inject.
  let contextStartIdx = 0;
  for (let i = agentRuns.length - 2; i >= 0; i--) {
    if (agentRuns[i].resolvedAgentType === currentAgentType) {
      // Find this run's position in the full message list and skip past its agent-return.
      const pos = messages.findIndex((m) => m.id === agentRuns[i].id);
      contextStartIdx = pos + 1;
      while (
        contextStartIdx < messages.length &&
        messages[contextStartIdx].type === "agent-return"
      ) {
        contextStartIdx++;
      }
      break;
    }
  }

  const contextMessages = messages.slice(contextStartIdx);
  const parts: string[] = [];

  for (const msg of contextMessages) {
    if (msg.type === "chat-user") {
      parts.push(`User: ${msg.content}`);
    } else if (msg.type === "agent-run" && msg.resolvedAgentType === prevAgentType) {
      const raw = await getSessionLog(sessionId, msg.id);
      const text = stripAnsi(raw).trim();
      if (text) {
        const label = AGENT_LABEL[prevAgentType] ?? prevAgentType;
        parts.push(`${label}:\n${text}`);
      }
    }
  }

  if (parts.length === 0) return null;

  const prevLabel = AGENT_LABEL[prevAgentType] ?? prevAgentType;
  return [
    `[Previous conversation context from ${prevLabel}]`,
    "",
    parts.join("\n\n"),
    "",
    "[End of previous context]",
  ].join("\n");
}
