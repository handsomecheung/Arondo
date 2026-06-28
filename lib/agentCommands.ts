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
    send: "commit the changes with message: $1.",
  },
];

// Custom entries (matched by command) override built-in ones; new commands are appended.
export function mergeAgentCommands(custom: AgentCommand[]): AgentCommand[] {
  const overridden = new Set(custom.map((c) => c.command));
  const remaining = AGENT_COMMANDS.filter((c) => !overridden.has(c.command));
  return [...custom, ...remaining];
}

export function getTriggerWord(cmd: AgentCommand): string {
  return cmd.command.split(/\s+/)[0];
}

export function getUniqueTriggers(
  commands: AgentCommand[] = AGENT_COMMANDS,
): string[] {
  return [...new Set(commands.map(getTriggerWord))];
}

export function resolveAgentCommand(
  promptText: string,
  commands: AgentCommand[] = AGENT_COMMANDS,
): string | null {
  const text = promptText.trim();
  if (!text.startsWith("/")) return null;
  const afterSlash = text.slice(1);
  for (const cmd of commands) {
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
