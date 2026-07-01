import fs from "fs/promises";
import path from "path";
import type { ConcreteAgentType } from "./agents/index";
import type { Message } from "./store";
import { getSessionLog } from "./store";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

const QUOTA_PATH = path.join(DATA_DIR, "autoselect", "agent", "quota.json");

// Maps ConcreteAgentType → binary name (must stay in sync with agents/index.ts).
const AGENT_BINARY: Record<string, string> = {
  claude: "claude",
  antigravity: "agy",
};

interface ClaudeQuota {
  Type: "claude";
  HourRemain: number | null;
  WeekRemain: number | null;
}

interface AntigravityQuota {
  Type: "antigravity";
  GeminiHourRemain: number | null;
  GeminiWeeklyRemain: number | null;
  OtherHourRemain: number | null;
  OtherWeeklyRemain: number | null;
}

type QuotaEntry = (ClaudeQuota | AntigravityQuota) & {
  Account: string;
  Plan: string;
  updatedAt: number;
};

async function readQuota(): Promise<Record<string, QuotaEntry>> {
  try {
    const raw = await fs.readFile(QUOTA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Returns the best-effort remaining quota score (0–1) for an agent type.
// Higher = more quota available. Returns null if no quota data exists.
function scoreAgent(type: ConcreteAgentType, quota: Record<string, QuotaEntry>): number | null {
  const entries = Object.values(quota).filter((e) => e.Type === type);
  if (entries.length === 0) return null;

  // Multiple accounts/plans for the same type: use the best one.
  let best = -Infinity;
  for (const entry of entries) {
    let score: number;
    if (entry.Type === "claude") {
      const q = entry as ClaudeQuota;
      // HourRemain and WeekRemain are remaining ratios (higher = more remaining).
      const hourRemain = q.HourRemain ?? 0;
      const weekRemain = q.WeekRemain ?? 0;
      // The binding constraint is whichever limit is tightest.
      score = Math.min(hourRemain, weekRemain);
    } else {
      const q = entry as AntigravityQuota;
      // Remaining ratios (higher = more quota left); null means disabled (0).
      const geminiScore = Math.min(
        q.GeminiHourRemain ?? 0,
        q.GeminiWeeklyRemain ?? 0,
      );
      const otherScore = Math.min(
        q.OtherHourRemain ?? 0,
        q.OtherWeeklyRemain ?? 0,
      );
      // The agent is usable if any model family has quota.
      score = Math.max(geminiScore, otherScore);
    }
    best = Math.max(best, score);
  }
  return best;
}

/**
 * Selects the best agent from the available binary names on a runner.
 * Falls back to the first available agent if no quota data exists.
 */
export async function selectAgent(runnerAgentBinaries: string[]): Promise<ConcreteAgentType | null> {
  // Binary → ConcreteAgentType lookup (reverse of AGENT_BINARY).
  const binaryToType = Object.fromEntries(
    Object.entries(AGENT_BINARY).map(([t, b]) => [b, t as ConcreteAgentType])
  );

  const candidateTypes = runnerAgentBinaries
    .map((b) => binaryToType[b])
    .filter((t): t is ConcreteAgentType => !!t);

  if (candidateTypes.length === 0) return null;
  if (candidateTypes.length === 1) return candidateTypes[0];

  const quota = await readQuota();

  let bestType: ConcreteAgentType = candidateTypes[0];
  let bestScore = -Infinity;
  let hasAnyData = false;

  for (const type of candidateTypes) {
    const score = scoreAgent(type, quota);
    if (score !== null) {
      hasAnyData = true;
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
  }

  // No quota data at all → fall back to first candidate.
  if (!hasAnyData) return candidateTypes[0];

  return bestType;
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
