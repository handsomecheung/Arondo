const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function getAutoagentWeekTimeRemain(
  weeklyResetsAt: number | null,
  now = Math.floor(Date.now() / 1000),
): number {
  if (weeklyResetsAt == null) return 0;
  return Math.max(0, Math.min(1, (weeklyResetsAt - now) / WEEK_SECONDS));
}

export function getAutoagentQuotaScore(
  weeklyRemain: number | null,
  weeklyResetsAt: number | null,
  now = Math.floor(Date.now() / 1000),
): number | null {
  if (weeklyRemain == null) return null;
  return weeklyRemain - getAutoagentWeekTimeRemain(weeklyResetsAt, now);
}
