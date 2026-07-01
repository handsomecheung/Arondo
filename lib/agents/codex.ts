import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";

/**
 * Adapter for OpenAI Codex CLI (https://github.com/openai/codex).
 *
 * Invokes: codex --approval-mode full-auto "<prompt>"
 * in the target repository directory.
 */
export class CodexAgent extends BaseAgent {
  readonly name = "codex";

  getCommand(_options: Omit<AgentRunOptions, "onOutput">): string {
    return `codex --approval-mode full-auto "$(< "$${PROMPT_ENV_VAR}")"`;
  }
}
