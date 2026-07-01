import fs from "fs/promises";
import path from "path";
import type { ConcreteAgentType } from "./agents/index";
import type { Message } from "./store";
import { getSessionLog } from "./store";
import { getConfigDir } from "./config";

const CONFIG_DIR = getConfigDir();

const QUOTA_PATH = path.join(CONFIG_DIR, "autoselect", "agent", "quota.json");

// Maps ConcreteAgentType → binary name (must stay in sync with agents/index.ts).
const AGENT_BINARY: Record<string, string> = {
  claude: "claude",
  antigravity: "agy",
};

export interface ResolvedAgent {
  agentType: ConcreteAgentType;
  model?: string;
}

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
}

type QuotaEntry = ClaudeQuota | AntigravityQuota;

async function readQuota(): Promise<Record<string, QuotaEntry>> {
  try {
    const raw = await fs.readFile(QUOTA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

interface AgentChoice {
  id: "A" | "B" | "C";
  agentType: ConcreteAgentType;
  model?: string;
}

/**
 * Selects the best agent and model from the available binary names on a runner.
 */
export async function selectAgent(runnerAgentBinaries: string[]): Promise<ResolvedAgent | null> {
  const hasAgy = runnerAgentBinaries.includes("agy");
  const hasClaude = runnerAgentBinaries.includes("claude");

  // A: agy + Gemini 3.5 Flash
  // B: agy + Claude Sonnet 4.6
  // C: claude + Sonnet
  const choices: AgentChoice[] = [];
  if (hasAgy) {
    choices.push({ id: "A", agentType: "antigravity", model: "Gemini 3.5 Flash (Medium)" });
    choices.push({ id: "B", agentType: "antigravity", model: "Claude Sonnet 4.6 (Thinking)" });
  }
  if (hasClaude) {
    choices.push({ id: "C", agentType: "claude" });
  }

  console.log(`[autoselect] Available runner binaries: ${runnerAgentBinaries.join(", ")}`);
  console.log(`[autoselect] Initial choices: ${choices.map((c) => c.id).join(", ")}`);

  if (choices.length === 0) {
    console.log("[autoselect] No choices available.");
    return null;
  }
  if (choices.length === 1) {
    console.log(`[autoselect] Only one choice available: ${choices[0].id}. Selecting it directly.`);
    return { agentType: choices[0].agentType, model: choices[0].model };
  }

  const quota = await readQuota();

  // Helper to extract relevant quota metrics for a choice
  const getMetrics = (choice: AgentChoice) => {
    let hourRemain = 1.0;
    let weekRemain = 1.0;
    let resetsAt: number | null = null;

    // Find the matching quota entries
    const entries = Object.values(quota);

    if (choice.id === "A") {
      const q = entries.find((e) => e.Type === "antigravity") as AntigravityQuota | undefined;
      if (q) {
        hourRemain = q.GeminiHourRemain ?? 1.0;
        weekRemain = q.GeminiWeeklyRemain ?? 1.0;
        resetsAt = q.GeminiWeeklyResetsAt;
      }
    } else if (choice.id === "B") {
      const q = entries.find((e) => e.Type === "antigravity") as AntigravityQuota | undefined;
      if (q) {
        hourRemain = q.OtherHourRemain ?? 1.0;
        weekRemain = q.OtherWeeklyRemain ?? 1.0;
        resetsAt = q.OtherWeeklyResetsAt;
      }
    } else if (choice.id === "C") {
      const q = entries.find((e) => e.Type === "claude") as ClaudeQuota | undefined;
      if (q) {
        hourRemain = q.HourRemain ?? 1.0;
        weekRemain = q.WeekRemain ?? 1.0;
        resetsAt = q.WeekResetsAt;
      }
    }

    return { hourRemain, weekRemain, resetsAt };
  };

  for (const choice of choices) {
    const { hourRemain, weekRemain, resetsAt } = getMetrics(choice);
    console.log(
      `[autoselect] Choice ${choice.id} (${choice.agentType} / ${choice.model ?? "default"}): ` +
      `HourRemain=${hourRemain}, WeekRemain=${weekRemain}, ResetsAt=${resetsAt}`
    );
  }

  // Step 1: Filter choices where HourRemain < 0.15
  const now = Math.floor(Date.now() / 1000);
  const lowQuotaChoices: AgentChoice[] = [];
  const normalChoices: AgentChoice[] = [];

  for (const choice of choices) {
    const { hourRemain } = getMetrics(choice);
    if (hourRemain < 0.15) {
      lowQuotaChoices.push(choice);
    } else {
      normalChoices.push(choice);
    }
  }

  console.log(
    `[autoselect] Step 1 Filter: Normal choices = [${normalChoices.map((c) => c.id).join(", ")}], ` +
    `Low quota choices (<0.15) = [${lowQuotaChoices.map((c) => c.id).join(", ")}]`
  );

  // Exception: if ALL available choices are low quota, keep them all in comparison
  let activeChoices = normalChoices;
  let excludedChoices = lowQuotaChoices;
  if (normalChoices.length === 0) {
    console.log("[autoselect] Exception: All choices are low quota. Keeping all choices in active list.");
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

    const score = weekRemain - weekTimeRemain;
    console.log(
      `[autoselect] Step 2 Scoring: Choice ${choice.id} -> ` +
      `WeekRemain=${weekRemain.toFixed(3)}, WeekTimeRemain=${weekTimeRemain.toFixed(3)}, ` +
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

  console.log(`[autoselect] Final Candidate Order: [${candidateAgents.map((c) => c.id).join(", ")}]`);

  const best = candidateAgents[0];
  console.log(`[autoselect] Selection Result: Choice ${best.id} (Agent: ${best.agentType}, Model: ${best.model ?? "default"})`);
  return { agentType: best.agentType, model: best.model };
}

// ─── Cross-agent context injection ────────────────────────────────────────────

const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

const AGENT_LABEL: Record<string, string> = {
  claude: "Claude Code",
  antigravity: "Antigravity CLI",
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
