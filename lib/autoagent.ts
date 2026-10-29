import fs from "fs/promises";
import path from "path";
import type { ConcreteAgentType } from "./agents/index";
import { getSessionLog, getAgentModelsConfig, getDefaultAgentModels, parseModelLine, parseModelList, type AgentModelsConfig, type Message } from "./store";
import { getConfigDir } from "./config";
import { stripAnsi } from "./ansi";
import type { AutoModelCostTier, AutoModelEffort, AutoModelOption } from "./llm/automodel";
import { getAutoagentQuotaScore, getAutoagentWeekTimeRemain } from "./autoagent-score";

const CONFIG_DIR = getConfigDir();

const QUOTA_PATH = path.join(CONFIG_DIR, "autoagent", "agent", "quota.json");

export interface ResolvedAgent {
  agentType: ConcreteAgentType;
  model?: string;
  effort?: AutoModelEffort;
  modelOptions?: AutoModelOption[];
  agyQuotaGroup?: AgyQuotaGroup;
}

export type AgyQuotaGroup = "gemini" | "other" | "argon";

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
  ArgonWeeklyRemain?: number | null;
  ArgonWeeklyResetsAt?: number | null;
  updatedAt: number | null;
  IsAPIKey?: boolean;
}

interface CodexQuota {
  Type: "codex";
  Plan: string;
  Account: string;
  DefaultModel: string;
  FiveHourRemain?: number | null;
  FiveHourResetAt?: number | null;
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

const EXHAUSTED_QUOTA_THRESHOLD = 0.02;

function getLatestQuotaByType(quota: Record<string, QuotaEntry>): Map<QuotaEntry["Type"], QuotaEntry> {
  const latest = new Map<QuotaEntry["Type"], QuotaEntry>();
  for (const entry of Object.values(quota)) {
    const existing = latest.get(entry.Type);
    if (!existing || (entry.updatedAt ?? 0) > (existing.updatedAt ?? 0)) latest.set(entry.Type, entry);
  }
  return latest;
}

function getQuotaMetrics(entry?: QuotaEntry, group?: AgyQuotaGroup) {
  if (entry?.Type === "antigravity") {
    return {
      hourRemain: group === "argon" ? null : group === "other" ? entry.OtherHourRemain ?? null : entry.GeminiHourRemain ?? null,
      weekRemain: group === "argon" ? entry.ArgonWeeklyRemain ?? null : group === "other" ? entry.OtherWeeklyRemain ?? null : entry.GeminiWeeklyRemain ?? null,
      resetsAt: group === "argon" ? entry.ArgonWeeklyResetsAt ?? null : group === "other" ? entry.OtherWeeklyResetsAt ?? null : entry.GeminiWeeklyResetsAt ?? null,
      isAPIKey: entry.IsAPIKey === true,
    };
  }
  return {
    hourRemain: entry?.Type === "claude" ? entry.HourRemain ?? null : entry?.FiveHourRemain ?? null,
    weekRemain: entry?.Type === "claude" ? entry.WeekRemain ?? null : entry?.WeeklyRemain ?? null,
    resetsAt: entry?.Type === "claude" ? entry.WeekResetsAt ?? null : entry?.WeeklyResetAt ?? null,
    isAPIKey: entry?.IsAPIKey === true,
  };
}

function isExhausted(metrics: ReturnType<typeof getQuotaMetrics>): boolean {
  // Collectors may compute 2% as 1 - 0.98, introducing floating-point noise.
  return !metrics.isAPIKey && [metrics.hourRemain, metrics.weekRemain]
    .some((remain) => remain !== null && remain <= EXHAUSTED_QUOTA_THRESHOLD + Number.EPSILON);
}

export async function isAgentQuotaExhausted(agentType: ConcreteAgentType, group?: AgyQuotaGroup): Promise<boolean> {
  if (agentType === "opencode") return false;
  const entry = getLatestQuotaByType(await readQuota()).get(agentType);
  return isExhausted(getQuotaMetrics(entry, group));
}

interface AgentChoice {
  id: "A" | "B" | "C" | "D" | "E";
  agentType: ConcreteAgentType;
  model?: string;
  modelOptions: AutoModelOption[];
  agyQuotaGroup?: AgyQuotaGroup;
}

const PREDEFINED_MODEL_OPTIONS: Record<string, Omit<AutoModelOption, "model">> = {
  "Gemini 4 Argon (High)": { id: "gemini-4-argon-high", costTier: "strong", description: "Gemini 4 Argon with high thinking for complex tasks." },
  "Gemini 4 Argon (Medium)": { id: "gemini-4-argon-medium", costTier: "standard", description: "Gemini 4 Argon balanced option." },
  "Gemini 4 Argon (Low)": { id: "gemini-4-argon-low", costTier: "cheap", description: "Gemini 4 Argon low thinking for small tasks." },
  "Gemini 3.8 Flash (High)": { id: "gemini-3.8-flash-high", costTier: "strong", description: "Gemini 3.8 Flash (High)" },
  "Gemini 3.8 Flash (Medium)": { id: "gemini-3.8-flash-medium", costTier: "standard", description: "Gemini 3.8 Flash (Medium)" },
  "Gemini 3.8 Flash (Low)": { id: "gemini-3.8-flash-low", costTier: "cheap", description: "Gemini 3.8 Flash (Low)" },
  "Claude Opus 5.5 (Low)": { id: "claude-opus-5-5-low", costTier: "standard", description: "Claude Opus 5.5 (Low)" },
  "Claude Opus 5.5 (Medium)": { id: "claude-opus-5-5-medium", costTier: "strong", description: "Claude Opus 5.5 (Medium)" },
  "Claude Opus 5.5 (High)": { id: "claude-opus-5-5-high", costTier: "strong", description: "Claude Opus 5.5 (High)" },
  "Claude Sonnet 5.5 (Low)": { id: "claude-sonnet-5-5-low", costTier: "cheap", description: "Claude Sonnet 5.5 (Low)" },
  "Claude Sonnet 5.5 (Medium)": { id: "claude-sonnet-5-5-medium", costTier: "standard", description: "Claude Sonnet 5.5 (Medium)" },
  "Claude Sonnet 5.5 (High)": { id: "claude-sonnet-5-5-high", costTier: "strong", description: "Claude Sonnet 5.5 (High)" },
  "GPT-OSS 120B (Medium)": { id: "gpt-oss-120b-medium", costTier: "cheap", description: "GPT-OSS 120B (Medium)" },
  "opus": { id: "claude-opus", costTier: "strong", description: "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok" },
  "fable": { id: "claude-fable", costTier: "strong", description: "Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok" },
  "sonnet": { id: "claude-sonnet", costTier: "standard", description: "Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok" },
  "haiku": { id: "claude-haiku", costTier: "cheap", description: "Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok ($0.50/$2.50 for prompts over 100k)" },
  "gpt-6.1-sol": { id: "codex-gpt-6.1-sol", costTier: "strong", description: "Latest workhorse model for coding and everyday work." },
  "gpt-6-astra": { id: "codex-gpt-6-astra", costTier: "strong", description: "Frontier intelligence for the most demanding work." },
  "gpt-6-sol": { id: "codex-gpt-6-sol", costTier: "standard", description: "Previous generation workhorse model." },
  "gpt-6-luna": { id: "codex-gpt-6-luna", costTier: "cheap", description: "Fast and affordable model for easier tasks." },
  "gpt-5.6-sol": { id: "codex-gpt-5.6-sol", costTier: "standard", description: "Older generation workhorse model." },
  "gpt-5.6-terra": { id: "codex-gpt-5.6-terra", costTier: "standard", description: "Older balanced model for straightforward work." },
  "gpt-5.6-luna": { id: "codex-gpt-5.6-luna", costTier: "cheap", description: "Older fast and efficient model." },
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
    const argonModels = parseModelList(configs.antigravity?.argon?.availableModels);
    if (agyQuotaGroup === "gemini") {
      return geminiModels.map((m) => buildModelOption(m, "antigravity"));
    }
    if (agyQuotaGroup === "other") {
      return otherModels.map((m) => buildModelOption(m, "antigravity"));
    }
    if (agyQuotaGroup === "argon") {
      return argonModels.map((m) => buildModelOption(m, "antigravity"));
    }
    return [
      ...geminiModels.map((m) => buildModelOption(m, "antigravity")),
      ...otherModels.map((m) => buildModelOption(m, "antigravity")),
      ...argonModels.map((m) => buildModelOption(m, "antigravity")),
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
      buildModelOption("gpt-6.1-sol", "codex"),
      buildModelOption("gpt-6-astra", "codex"),
      buildModelOption("gpt-6-sol", "codex"),
      buildModelOption("gpt-6-luna", "codex"),
      buildModelOption("gpt-5.6-sol", "codex"),
      buildModelOption("gpt-5.6-terra", "codex"),
      buildModelOption("gpt-5.6-luna", "codex"),
    ];
  }
  return [];
}

export function getAgyQuotaGroupForModel(model?: string): AgyQuotaGroup | undefined {
  const cleaned = parseModelLine(model);
  if (!cleaned) return undefined;
  const lower = cleaned.toLowerCase();
  if (lower.includes("argon")) return "argon";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("gpt-oss") || lower.includes("claude") || lower.includes("opus") || lower.includes("sonnet")) return "other";
  return "gemini";
}

/**
 * Selects the best agent and model from the available binary names on a runner.
 */
export async function selectAgent(
  runnerAgentBinaries: string[],
  writeLog?: (text: string) => void | Promise<void>,
): Promise<ResolvedAgent | null> {
  const logParts = ["# autoagent", `Time: ${new Date().toISOString()}`, "## Input", JSON.stringify({ runnerAgentBinaries }, null, 2)];
  const log = (text: string, stdout = true) => {
    if (stdout) console.log(text);
    logParts.push(text);
  };
  try {
    const selected = await selectAgentFromQuota(runnerAgentBinaries, log);
    logParts.push("## Quota selection", JSON.stringify(selected, null, 2));
    return selected;
  } finally {
    await writeLog?.(logParts.join("\n") + "\n");
  }
}

async function selectAgentFromQuota(
  runnerAgentBinaries: string[],
  log: (text: string, stdout?: boolean) => void,
): Promise<ResolvedAgent | null> {
  const agentModels = await getAgentModelsConfig();
  const hasAgy = runnerAgentBinaries.includes("agy");
  const hasClaude = runnerAgentBinaries.includes("claude");
  const hasCodex = runnerAgentBinaries.includes("codex");

  // A: agy + Gemini models
  // B: agy + Other (Claude) models
  // C: claude
  // D: codex + gpt-6-sol
  // E: agy + Gemini 4 Argon models
  const choices: AgentChoice[] = [];
  if (hasAgy) {
    const geminiOptions = getModelOptionsForAgent("antigravity", "gemini", agentModels);
    const otherOptions = getModelOptionsForAgent("antigravity", "other", agentModels);
    const argonOptions = getModelOptionsForAgent("antigravity", "argon", agentModels);
    const agyDefault = parseModelLine(agentModels.antigravity?.gemini?.defaultModel) || geminiOptions[0]?.model || "Gemini 3.8 Flash (Medium)";
    const otherDefault = parseModelLine(agentModels.antigravity?.other?.defaultModel) || otherOptions[0]?.model || "Claude Sonnet 5.5 (Medium)";
    const argonDefault = parseModelLine(agentModels.antigravity?.argon?.defaultModel) || argonOptions[0]?.model || "Gemini 4 Argon (Medium)";

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
    choices.push({
      id: "E",
      agentType: "antigravity",
      model: argonDefault,
      modelOptions: argonOptions,
      agyQuotaGroup: "argon",
    });
  }
  if (hasClaude) {
    const claudeOptions = getModelOptionsForAgent("claude", undefined, agentModels);
    const claudeDefault = parseModelLine(agentModels.claude?.defaultModel) || claudeOptions[0]?.model || "opus";
    choices.push({
      id: "C",
      agentType: "claude",
      model: claudeDefault,
      modelOptions: claudeOptions,
    });
  }
  if (hasCodex) {
    const codexOptions = getModelOptionsForAgent("codex", undefined, agentModels);
    const codexDefault = parseModelLine(agentModels.codex?.defaultModel) || "gpt-6-sol";
    choices.push({
      id: "D",
      agentType: "codex",
      model: codexDefault,
      modelOptions: codexOptions,
    });
  }

  log(`[autoagent] Available runner binaries: ${runnerAgentBinaries.join(", ")}`);
  log(`[autoagent] Initial choices: ${choices.map((c) => c.id).join(", ")}`);

  log(`## Choices\n${JSON.stringify(choices, null, 2)}`, false);

  if (choices.length === 0) {
    log("[autoagent] No choices available.");
    return null;
  }
  const quota = await readQuota();
  const latestEntryByType = getLatestQuotaByType(quota);
  log(`## Quota\n${JSON.stringify({ path: QUOTA_PATH, entries: quota, latestEntryByType: Object.fromEntries(latestEntryByType) }, null, 2)}`, false);

  const getMetrics = (choice: AgentChoice) => getQuotaMetrics(
    latestEntryByType.get(choice.agentType as QuotaEntry["Type"]), choice.agyQuotaGroup,
  );

  for (const choice of choices) {
    const { hourRemain, weekRemain, resetsAt } = getMetrics(choice);
    log(
      `[autoagent] Choice ${choice.id} (${choice.agentType} / ${choice.model ?? "default"}): ` +
      `HourRemain=${hourRemain}, WeekRemain=${weekRemain}, ResetsAt=${resetsAt}`
    );
  }

  const eligibleChoices = choices.filter((choice) => {
    const metrics = getMetrics(choice);
    if (!isExhausted(metrics)) return true;
    log(`[autoagent] Excluded exhausted choice ${choice.id}: HourRemain=${metrics.hourRemain}, WeekRemain=${metrics.weekRemain} (threshold <=${EXHAUSTED_QUOTA_THRESHOLD})`);
    return false;
  });
  if (eligibleChoices.length === 0) {
    log("[autoagent] No eligible choices: all quotas are exhausted.");
    return null;
  }

  const knownQuotaChoices = eligibleChoices.filter((choice) => {
    const { weekRemain, isAPIKey } = getMetrics(choice);
    return !isAPIKey && weekRemain !== null;
  });
  const unknownQuotaChoices = eligibleChoices.filter((choice) => {
    const { weekRemain, isAPIKey } = getMetrics(choice);
    return !isAPIKey && weekRemain === null;
  });
  const apiKeyChoices = eligibleChoices.filter((choice) => getMetrics(choice).isAPIKey);

  if (knownQuotaChoices.length === 0) {
    const fallbackChoices = unknownQuotaChoices.length > 0 ? unknownQuotaChoices : apiKeyChoices;
    log(`[autoagent] No known quota scores. Falling back to ${unknownQuotaChoices.length > 0 ? "unknown" : "API Key"} choices: [${fallbackChoices.map((c) => c.id).join(", ")}]`);
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

  log(
    `[autoagent] Step 1 Filter: Normal choices = [${normalChoices.map((c) => c.id).join(", ")}], ` +
    `Low quota choices (<0.15) = [${lowQuotaChoices.map((c) => c.id).join(", ")}]`
  );

  // Exception: if ALL available choices are low quota, keep them all in comparison
  let activeChoices = normalChoices;
  let excludedChoices = lowQuotaChoices;
  if (normalChoices.length === 0) {
    log("[autoagent] Exception: All choices are low quota. Keeping all choices in active list.");
    activeChoices = lowQuotaChoices;
    excludedChoices = [];
  }

  // Step 2: Score active choices based on WeekRemain and time passed in week
  const scoredChoices = activeChoices.map((choice) => {
    const { weekRemain, resetsAt } = getMetrics(choice);
    const weekTimeRemain = getAutoagentWeekTimeRemain(resetsAt, now);
    const score = getAutoagentQuotaScore(weekRemain, resetsAt, now)!;
    log(
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

  log(`[autoagent] Final Candidate Order: [${candidateAgents.map((c) => c.id).join(", ")}]`);

  const best = candidateAgents[0];
  log(`[autoagent] Selection Result: Choice ${best.id} (Agent: ${best.agentType}, Model: ${best.model ?? "default"})`);
  return {
    agentType: best.agentType,
    model: best.model,
    modelOptions: best.modelOptions,
    agyQuotaGroup: best.agyQuotaGroup,
  };
}

/**
 * Quota retries require a non-exhausted weekly window and at least 15% hourly
 * quota when known. Unknown quota remains available to avoid blocking forever.
 */
export async function isQuotaAvailable(
  agentType?: ConcreteAgentType,
  agyQuotaGroup?: AgyQuotaGroup,
): Promise<boolean> {
  if (agentType === "opencode") return true;
  const latest = getLatestQuotaByType(await readQuota());
  if (latest.size === 0) return true;
  const relevant = agentType ? [latest.get(agentType)] : [...latest.values()];
  return relevant.some((entry) => {
    const groups: (AgyQuotaGroup | undefined)[] = entry?.Type === "antigravity"
      ? agyQuotaGroup ? [agyQuotaGroup] : ["gemini", "other", "argon"]
      : [undefined];
    return groups.some((group) => {
      const metrics = getQuotaMetrics(entry, group);
      return !isExhausted(metrics) && (metrics.isAPIKey || (metrics.hourRemain ?? 1) >= 0.15);
    });
  });
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
    if (msg.deleted) continue;
    if (msg.type === "chat-user") {
      parts.push(`User: ${msg.content}`);
    } else if (msg.type === "agent-run" && msg.resolvedAgentType === prevAgentType) {
      const raw = await getSessionLog(sessionId, msg.id, "agent");
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
