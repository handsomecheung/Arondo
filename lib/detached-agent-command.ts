import type { DetachedAgentKind } from "@/lib/store";

const DETACHED_AGENT_TYPES = ["auto", "antigravity", "claude", "codex", "opencode"] as const;

export interface DetachedAgentCommand {
  kind: DetachedAgentKind;
  message: string;
  agentType?: string;
}

export function parseDetachedAgentCommand(input: string): DetachedAgentCommand | null {
  const match = input.trim().match(/^\/(review|btw)(?:\s+--agent\s+(\S+))?(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const rawMessage = match[3]?.trim() || "";
  const message = (rawMessage.startsWith('"') && rawMessage.endsWith('"')) ||
    (rawMessage.startsWith("'") && rawMessage.endsWith("'"))
    ? rawMessage.slice(1, -1)
    : rawMessage;

  return {
    kind: match[1] as DetachedAgentKind,
    message,
    agentType: match[2] === "agy" ? "antigravity" : match[2],
  };
}

export function isDetachedAgentType(agentType: string): boolean {
  return (DETACHED_AGENT_TYPES as readonly string[]).includes(agentType);
}
