import { getAutoagentQuotaScore } from "./autoagent-score";

export type AgentQuota = { Account?: string; IsAPIKey?: boolean; Plan?: string } & Partial<Record<
  | 'HourRemain' | 'HourResetAt' | 'WeekRemain' | 'WeekResetsAt'
  | 'MonthlyRemain' | 'MonthlyResetAt'
  | 'FiveHourRemain' | 'FiveHourResetAt' | 'WeeklyRemain' | 'WeeklyResetAt'
  | 'GeminiHourRemain' | 'GeminiHourResetsAt' | 'GeminiWeeklyRemain' | 'GeminiWeeklyResetsAt'
  | 'OtherHourRemain' | 'OtherHourResetsAt' | 'OtherWeeklyRemain' | 'OtherWeeklyResetsAt'
  | 'ArgonHourRemain' | 'ArgonHourResetsAt' | 'ArgonWeeklyRemain' | 'ArgonWeeklyResetsAt', number | null>>;
export type ModelQuotas = Partial<Record<"antigravity" | "claude" | "codex" | "opencode" | "pi", AgentQuota | null>>;
export type QuotaGroup = "claude" | "codex" | "opencode" | "gemini" | "other" | "argon";

export function quotaNumber(quota: AgentQuota | null | undefined, key: string): number | null {
  const value = quota?.[key as keyof AgentQuota];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getQuotaRows(quota: AgentQuota | null | undefined, agent: "antigravity" | "claude" | "codex" | "opencode" | "pi", group: string) {
  if (agent === "pi") return [];
  const windows = agent === "antigravity"
    ? [["hour", `${group}HourRemain`, `${group}HourResetsAt`], ["week", `${group}WeeklyRemain`, `${group}WeeklyResetsAt`]]
    : agent === "claude"
      ? [["hour", "HourRemain", "HourResetAt"], ["week", "WeekRemain", "WeekResetsAt"]]
      : [["hour", "FiveHourRemain", "FiveHourResetAt"], ["week", "WeeklyRemain", "WeeklyResetAt"], ...(agent === "opencode" ? [["month", "MonthlyRemain", "MonthlyResetAt"]] : [])];
  return windows.flatMap(([label, key, resetKey]) => {
    const remain = quotaNumber(quota, key);
    return remain == null ? [] : [{ label, remaining: Math.max(0, Math.min(1, remain)), resetsAt: quotaNumber(quota, resetKey) }];
  });
}

export function getQuotaScoreColors(quota: ModelQuotas | null): Partial<Record<QuotaGroup, string>> {
  if (!quota) return {};
  const score = (entry: AgentQuota | null | undefined, remain: string, reset: string) => entry?.IsAPIKey
    ? null : getAutoagentQuotaScore(quotaNumber(entry, remain), quotaNumber(entry, reset));
  const scores = {
    claude: score(quota.claude, "WeekRemain", "WeekResetsAt"),
    gemini: score(quota.antigravity, "GeminiWeeklyRemain", "GeminiWeeklyResetsAt"),
    other: score(quota.antigravity, "OtherWeeklyRemain", "OtherWeeklyResetsAt"),
    argon: score(quota.antigravity, "ArgonWeeklyRemain", "ArgonWeeklyResetsAt"),
    opencode: score(quota.opencode, "WeeklyRemain", "WeeklyResetAt"),
    codex: score(quota.codex, "WeeklyRemain", "WeeklyResetAt"),
  };
  const known = Object.values(scores).filter((value): value is number => value != null);
  if (!known.length) return {};
  const lowest = Math.min(...known);
  const highest = Math.max(...known);
  return Object.fromEntries(Object.entries(scores).flatMap(([key, value]) => {
    if (value == null) return [];
    const position = highest === lowest ? 1 : (value - lowest) / (highest - lowest);
    return [[key, `hsl(${Math.round(position * 120)} 70% 42%)`]];
  }));
}
