export interface AgentCommand {
  command: string;
  matcher?: string;
  send: string;
  menuLabel?: string;
  menuDescription?: string;
}

export const AGENT_COMMANDS: AgentCommand[] = [
  {
    command: "commit",
    menuLabel: "/commit",
    menuDescription: "Commit the changes",
    matcher: "^commit$",
    send: "commit the changes",
  },
  {
    command: "commit message",
    menuLabel: "/commit <message>",
    menuDescription: "Commit the changes with a specific message",
    matcher: "^commit\\s+(.+)$",
    send: "commit the changes with message: $1. Use this exact message — do not add, modify, or append any extra information to it.",
  },
];

export function getTriggerWord(cmd: AgentCommand): string {
  return cmd.command.split(/\s+/)[0];
}

// Returns one entry per unique trigger (for command menu rendering)
export function getMenuCommands(): AgentCommand[] {
  const seen = new Set<string>();
  return AGENT_COMMANDS.filter((cmd) => {
    const trigger = getTriggerWord(cmd);
    if (seen.has(trigger)) return false;
    seen.add(trigger);
    return true;
  });
}

export function getUniqueTriggers(): string[] {
  return [...new Set(AGENT_COMMANDS.map(getTriggerWord))];
}

// Returns the resolved send message for a given prompt (e.g. "/commit foo"), or null if no match
export function resolveAgentCommand(promptText: string): string | null {
  const text = promptText.trim();
  if (!text.startsWith("/")) return null;
  const afterSlash = text.slice(1);
  for (const cmd of AGENT_COMMANDS) {
    if (cmd.matcher) {
      const m = afterSlash.match(new RegExp(cmd.matcher));
      if (m) {
        let msg = cmd.send;
        for (let i = 1; i < m.length; i++) {
          msg = msg.replace(new RegExp(`\\$${i}`, "g"), m[i]);
        }
        return msg;
      }
    } else {
      if (afterSlash === getTriggerWord(cmd)) {
        return cmd.send;
      }
    }
  }
  return null;
}
