import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "./config";
import {
  getSessions,
  getMessages,
  addTodoMessage,
  getSession,
  type Session,
} from "./store";
import { eventBus } from "./event-bus";
import { runnerManager } from "./runner-manager";
import { isQuotaErrorMessage } from "./agent-quota-errors";

const STALE_QUOTA_THRESHOLD_S = 5 * 60;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const TYPE_TO_BINARY: Record<string, string> = {
  claude: "claude",
  antigravity: "agy",
  codex: "codex",
};

interface BaseQuotaEntry {
  Type: string;
  Account?: string;
  Plan?: string;
  updatedAt?: number | null;
  IsAPIKey?: boolean;
}

interface ClaudeQuota extends BaseQuotaEntry {
  Type: "claude";
  HourRemain?: number | null;
  HourResetAt?: number | null;
  WeekRemain?: number | null;
  WeekResetsAt?: number | null;
}

interface AntigravityQuota extends BaseQuotaEntry {
  Type: "antigravity";
  GeminiWeeklyRemain?: number | null;
  GeminiWeeklyResetsAt?: number | null;
  GeminiHourRemain?: number | null;
  GeminiHourResetsAt?: number | null;
  OtherWeeklyRemain?: number | null;
  OtherWeeklyResetsAt?: number | null;
  OtherHourRemain?: number | null;
  OtherHourResetsAt?: number | null;
}

interface CodexQuota extends BaseQuotaEntry {
  Type: "codex";
  FiveHourRemain?: number | null;
  FiveHourResetAt?: number | null;
  WeeklyRemain?: number | null;
  WeeklyResetAt?: number | null;
}

type QuotaEntry = ClaudeQuota | AntigravityQuota | CodexQuota;

async function readQuota(): Promise<Record<string, QuotaEntry>> {
  try {
    const raw = await fs.readFile(
      path.join(getConfigDir(), "autoagent", "agent", "quota.json"),
      "utf-8"
    );
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getLatestQuotaEntry(
  quotas: Record<string, QuotaEntry>,
  agentType: string,
  runnerId?: string
): QuotaEntry | null {
  const entries = Object.values(quotas).filter((e) => e.Type === agentType);
  if (entries.length === 0) return null;

  if (runnerId) {
    const runner = runnerManager.getRunner(runnerId);
    if (runner) {
      const boundAgent = runner.info.quotaAgents?.find((a) => a.Type === agentType);
      if (boundAgent) {
        const key = `${boundAgent.Type}_${boundAgent.Account}_${boundAgent.Plan}`;
        if (quotas[key]) return quotas[key];
      }
    }
  }

  return entries.reduce((latest, current) => {
    return (current.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? current : latest;
  }, entries[0]);
}

function getResetTimestampSec(
  entry: QuotaEntry | null,
  agentType: string,
  agyQuotaGroup?: "gemini" | "other"
): number | null {
  if (!entry) return null;

  if (agentType === "claude") {
    const q = entry as ClaudeQuota;
    if ((q.HourRemain ?? 1) < 0.15 && q.HourResetAt) return q.HourResetAt;
    if ((q.WeekRemain ?? 1) < 0.15 && q.WeekResetsAt) return q.WeekResetsAt;
    return q.HourResetAt || q.WeekResetsAt || null;
  }

  if (agentType === "antigravity") {
    const q = entry as AntigravityQuota;
    if (agyQuotaGroup === "gemini") {
      if ((q.GeminiHourRemain ?? 1) < 0.15 && q.GeminiHourResetsAt) return q.GeminiHourResetsAt;
      return q.GeminiWeeklyResetsAt || q.GeminiHourResetsAt || null;
    }
    if (agyQuotaGroup === "other") {
      if ((q.OtherHourRemain ?? 1) < 0.15 && q.OtherHourResetsAt) return q.OtherHourResetsAt;
      return q.OtherWeeklyResetsAt || q.OtherHourResetsAt || null;
    }
    return (
      q.GeminiHourResetsAt ||
      q.GeminiWeeklyResetsAt ||
      q.OtherHourResetsAt ||
      q.OtherWeeklyResetsAt ||
      null
    );
  }

  if (agentType === "codex") {
    const q = entry as CodexQuota;
    if ((q.FiveHourRemain ?? 1) < 0.15 && q.FiveHourResetAt) return q.FiveHourResetAt;
    return q.WeeklyResetAt || q.FiveHourResetAt || null;
  }

  return null;
}

async function processQuotaErrorSession(
  session: Session,
  quotas: Record<string, QuotaEntry>
): Promise<void> {
  const messages = await getMessages(session.id);
  const lastUserMsg = [...messages]
    .reverse()
    .find((m) => m.role === "user" && m.type !== "user-todo");
  if (!lastUserMsg) return;

  const lastAgentRun = [...messages].reverse().find((m) => m.type === "agent-run");
  const agentType =
    lastAgentRun?.resolvedAgentType || session.autoLockedAgentType || session.agentType;
  const agyQuotaGroup =
    lastAgentRun?.resolvedAgyQuotaGroup || session.autoLockedAgyQuotaGroup;
  const binary = TYPE_TO_BINARY[agentType] || agentType;

  const quotaEntry = getLatestQuotaEntry(quotas, agentType, session.runnerId);
  const nowSec = Math.floor(Date.now() / 1000);
  const lastUpdatedAtSec = quotaEntry?.updatedAt;
  const isStale =
    lastUpdatedAtSec == null || nowSec - lastUpdatedAtSec > STALE_QUOTA_THRESHOLD_S;

  if (isStale) {
    const runnerId = session.runnerId;
    const runner = runnerManager.getRunner(runnerId);
    if (runner && runner.info.connected && runner.info.agents.includes(binary)) {
      runnerManager.sendFire(runnerId, "info.fetch", { agent: binary });
      console.log(
        `[quota-retry] Stale quota for ${agentType} (session ${session.id}) — requested info.fetch on runner ${runnerId}`
      );
    } else {
      const fallbackRunner = runnerManager
        .getRunners()
        .find((r) => r.connected && r.agents.includes(binary));
      if (fallbackRunner) {
        runnerManager.sendFire(fallbackRunner.id, "info.fetch", { agent: binary });
        console.log(
          `[quota-retry] Stale quota for ${agentType} (session ${session.id}) — requested info.fetch on fallback runner ${fallbackRunner.id}`
        );
      }
    }
    return;
  }

  const resetTimeSec = getResetTimestampSec(
    quotaEntry,
    agentType,
    agyQuotaGroup as "gemini" | "other" | undefined
  );
  const nowMs = Date.now();
  const resetTimeMs = resetTimeSec ? resetTimeSec * 1000 : null;

  let scheduledTimestamp: number;
  if (resetTimeMs != null && resetTimeMs > nowMs) {
    scheduledTimestamp = resetTimeMs + FIVE_MINUTES_MS;
  } else {
    scheduledTimestamp = nowMs + FIVE_MINUTES_MS;
  }

  const todoMessage = await addTodoMessage(session.id, {
    content: lastUserMsg.content,
    prompt: lastUserMsg.prompt,
    trigger: {
      kind: "at",
      timestamp: scheduledTimestamp,
    },
    tokenUuid: lastUserMsg.tokenUuid || session.tokenUuid,
  });

  eventBus.publish({ type: "message_added", payload: todoMessage });
  const updatedSession = await getSession(session.id);
  if (updatedSession) {
    eventBus.publish({ type: "session_updated", payload: updatedSession });
  }

  console.log(
    `[quota-retry] Converted quota error session ${session.id} to scheduled message at ${new Date(
      scheduledTimestamp
    ).toISOString()}`
  );
}

let isTicking = false;

export async function processQuotaErrorRetries(): Promise<void> {
  if (isTicking) return;
  isTicking = true;
  try {
    const sessions = await getSessions();
    const quotas = await readQuota();

    for (const session of sessions) {
      if (session.pendingTodoMessageIds && session.pendingTodoMessageIds.length > 0) {
        continue;
      }

      if (session.status === "error" && isQuotaErrorMessage(session.errorMessage)) {
        try {
          await processQuotaErrorSession(session, quotas);
        } catch (err) {
          console.error(
            `[quota-retry] Failed to process quota error for session ${session.id}:`,
            err
          );
        }
      }
    }
  } catch (err) {
    console.error("[quota-retry] processing failed:", err);
  } finally {
    isTicking = false;
  }
}
