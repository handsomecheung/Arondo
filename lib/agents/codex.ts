import { spawn } from "child_process";
import { BaseAgent, AgentRunOptions, AgentResult } from "./base";

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

  async run({ prompt, repoPath, onOutput }: AgentRunOptions): Promise<AgentResult> {
    return new Promise((resolve) => {
      const fullPrompt = this.getSystemPrompt(prompt);

      const args: string[] = [
        "--approval-mode", "full-auto",
        fullPrompt,
      ];

      const proc = spawn("codex", args, {
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
          command: this.getCommand({ prompt, repoPath }),
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          output,
          error: err.message,
          command: this.getCommand({ prompt, repoPath }),
        });
      });
    });
  }
}
