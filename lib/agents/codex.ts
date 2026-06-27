import { BaseAgent, AgentRunOptions } from "./base";

/**
 * Adapter for OpenAI Codex CLI (https://github.com/openai/codex).
 *
 * Invokes: codex --approval-mode full-auto "<prompt>"
 * in the target repository directory.
 */
export class CodexAgent extends BaseAgent {
  readonly name = "codex";

  getCommand({ prompt }: Omit<AgentRunOptions, "onOutput">): string {
    const fullPrompt = this.getSystemPrompt(prompt);
    const escapedPrompt = fullPrompt.replace(/"/g, '\\"');
    return `codex --approval-mode full-auto "${escapedPrompt}"`;
  }
}
