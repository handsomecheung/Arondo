import { BaseAgent, AgentRunOptions } from "./base";

/**
 * Adapter for Claude Code (https://github.com/anthropics/claude-code).
 *
 * Invokes: claude --print "<prompt>" --allowedTools "all" --dangerously-skip-permissions
 * in the target repository directory.
 */
export class ClaudeCodeAgent extends BaseAgent {
  readonly name = "claude";

  getCommand({ prompt, sessionId, isResume }: Omit<AgentRunOptions, "onOutput">): string {
    const fullPrompt = this.getSystemPrompt(prompt);
    const escapedPrompt = fullPrompt.replace(/"/g, '\\"');
    let sessionFlag = "";
    if (sessionId) {
      sessionFlag = isResume
        ? ` --resume "${sessionId}"`
        : ` --session-id "${sessionId}"`;
    }
    return `claude --print "${escapedPrompt}" --allowedTools "all" --dangerously-skip-permissions${sessionFlag}`;
  }
}
