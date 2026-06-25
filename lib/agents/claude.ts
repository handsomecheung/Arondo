import { spawn } from "child_process";
import { BaseAgent, AgentRunOptions, AgentResult } from "./base";

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

  async run({ prompt, repoPath, onOutput, sessionId, isResume }: AgentRunOptions): Promise<AgentResult> {
    return new Promise((resolve) => {
      const fullPrompt = this.getSystemPrompt(prompt);

      const args: string[] = [
        "--print", fullPrompt,
        "--allowedTools", "all",
        "--dangerously-skip-permissions",
      ];

      if (sessionId) {
        if (isResume) {
          args.push("--resume", sessionId);
        } else {
          args.push("--session-id", sessionId);
        }
      }

      const proc = spawn("claude", args, {
        cwd: repoPath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        for (const line of text.split("\n")) {
          if (line.trim()) onOutput?.(line);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        errorOutput += text;
        for (const line of text.split("\n")) {
          if (line.trim()) onOutput?.(`[stderr] ${line}`);
        }
      });

      proc.on("close", (code) => {
        const success = code === 0;
        resolve({
          success,
          output,
          error: success ? undefined : errorOutput || `Process exited with code ${code}`,
          command: this.getCommand({ prompt, repoPath, sessionId, isResume }),
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          output,
          error: err.message,
          command: this.getCommand({ prompt, repoPath, sessionId, isResume }),
        });
      });
    });
  }
}
