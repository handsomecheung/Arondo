type QuotaRetryAgentType = "antigravity" | "claude";

const AGY_QUOTA_PATTERNS = [
  "individual quota reached",
  "please upgrade your subscription to increase your limits",
];

const CLAUDE_QUOTA_PATTERNS = [
  "you've hit your session limit",
];

const QUOTA_ERROR_MESSAGES = [
  "agy quota exhausted",
  "Claude session limit hit",
];

export function isAgentQuotaExhausted(
  agentType: string | undefined,
  log: string,
  success: boolean,
): boolean {
  const normalizedLog = log.trim();
  const lowerLog = normalizedLog.toLowerCase();

  if (agentType === "antigravity") {
    return (
      (success && !normalizedLog) ||
      AGY_QUOTA_PATTERNS.some((pattern) => lowerLog.includes(pattern))
    );
  }

  if (agentType === "claude") {
    return CLAUDE_QUOTA_PATTERNS.some((pattern) => lowerLog.includes(pattern));
  }

  return false;
}

export function getAgentQuotaErrorMessage(agentType: string | undefined): string {
  return agentType === "claude"
    ? "Claude session limit hit"
    : "agy quota exhausted — quota limit reached";
}

export function isQuotaErrorMessage(errorMessage: string | undefined | null): boolean {
  if (!errorMessage) return false;
  return QUOTA_ERROR_MESSAGES.some((message) => errorMessage.includes(message));
}

export function getQuotaRetryAgentType(agentType: string | undefined): QuotaRetryAgentType | undefined {
  if (agentType === "antigravity" || agentType === "claude") return agentType;
  return undefined;
}

export function isAgyInvalidModelError(log: string): boolean {
  return log.toLowerCase().includes("invalid model selection");
}

export function getAgyInvalidModelErrorMessage(): string {
  return "Invalid model selection for Antigravity — please update the model in Settings, or temporarily avoid using Auto mode.";
}
