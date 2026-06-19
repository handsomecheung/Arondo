import { spawn } from "child_process";
import { BaseAgent, AgentRunOptions, AgentResult } from "./base";

/**
 * Adapter for Gemini CLI (https://github.com/google-gemini/gemini-cli).
 *
 * Invokes: gemini --prompt "<prompt>" --yolo --output-format text --skip-trust
 * in the target repository directory.
 */
export class GeminiAgent extends BaseAgent {
  readonly name = "gemini";

  getCommand({ prompt, sessionId, isResume }: Omit<AgentRunOptions, "onOutput">): string {
    const fullPrompt = this.getSystemPrompt(prompt);
    const escapedPrompt = fullPrompt.replace(/"/g, '\\"');
    if (sessionId) {
      if (isResume) {
        return `gemini --resume "${sessionId}" --prompt "${escapedPrompt}" --yolo --output-format text --skip-trust`;
      } else {
        return `gemini --session-id "${sessionId}" --prompt "${escapedPrompt}" --yolo --output-format text --skip-trust`;
      }
    }
    return `gemini --prompt "${escapedPrompt}" --yolo --output-format text --skip-trust`;
  }

  async run({ prompt, repoPath, onOutput, sessionId, isResume }: AgentRunOptions): Promise<AgentResult> {
    return new Promise((resolve) => {
      const fullPrompt = this.getSystemPrompt(prompt);
      const args: string[] = [];
      
      if (sessionId) {
        if (isResume) {
          args.push("--resume", sessionId);
        } else {
          args.push("--session-id", sessionId);
        }
      }

      args.push(
        "--prompt", fullPrompt,
        "--yolo",
        "--output-format", "text",
        "--skip-trust"
      );

      const proc = spawn("gemini", args, {
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
          prUrl: this.extractPrUrl(output),
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
