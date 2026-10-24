const QUOTA_ERROR_MESSAGES = [
  "agy quota exhausted",
  "Claude session limit hit",
  "Agent quota exhausted",
];

export function getAgentQuotaErrorMessage(agentType: string | undefined): string {
  if (agentType === "claude") return "Claude session limit hit";
  if (agentType === "antigravity") return "agy quota exhausted — quota limit reached";
  return "Agent quota exhausted — quota limit reached";
}

export function isQuotaErrorMessage(errorMessage: string | undefined | null): boolean {
  if (!errorMessage) return false;
  return QUOTA_ERROR_MESSAGES.some((message) => errorMessage.includes(message));
}
