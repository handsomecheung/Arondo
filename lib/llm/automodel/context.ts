import { getSessionLog, type Message } from "../../store";
import { stripAnsi } from "../../ansi";
import { isAutomodelEnabled } from "../config";

export async function buildEffortContext(sessionId: string, messages: Message[]): Promise<string | undefined> {
  if (!isAutomodelEnabled()) return undefined;
  const history = messages.filter((message) => !message.deleted
    && (message.type === "chat-user" || message.type === "agent-run"));
  const firstUser = history.find((message) => message.type === "chat-user");
  const recent = history.slice(-4);
  const parts = firstUser && !recent.includes(firstUser)
    ? [`Original task:\n${(firstUser.prompt || firstUser.content).slice(0, 1500)}`]
    : [];
  for (const message of recent) {
    if (message.type === "chat-user") {
      parts.push(`User:\n${(message.prompt || message.content).slice(0, 1500)}`);
    } else {
      const output = stripAnsi(await getSessionLog(sessionId, message.id, "agent")).trim();
      if (output) parts.push(`Agent:\n${output.slice(-2000)}`);
    }
  }
  return parts.join("\n\n");
}
