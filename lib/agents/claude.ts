import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";

/**
 * Adapter for Claude Code (https://github.com/anthropics/claude-code).
 *
 * Prompt is passed via the env var defined by PROMPT_ENV_VAR, set by the runner.
 */
export class ClaudeCodeAgent extends BaseAgent {
  readonly name = "claude";

  getCommand({ sessionId, isResume, model }: Omit<AgentRunOptions, "onOutput">): string {
    let sessionFlag = "";
    if (sessionId) {
      sessionFlag = isResume
        ? ` --resume "${sessionId}"`
        : ` --session-id "${sessionId}"`;
    }
    const modelArg = model ? ` --model "${model}"` : "";
    return `claude --print "$(< "$${PROMPT_ENV_VAR}")" --allowedTools "all" --dangerously-skip-permissions${sessionFlag}${modelArg}`;
  }
}
