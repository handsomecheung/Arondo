import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { BaseAgent, AgentRunOptions, AgentResult } from "./base";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const AGY_SESSION_MAP_FILE = path.join(DATA_DIR, "agy-sessions.json");

const AGY_LOG_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli", "log");
const CONV_ID_RE = /Created conversation ([0-9a-f-]{36})/;

function getAgySessionIdSync(sessionId: string): string | undefined {
  try {
    const raw = fsSync.readFileSync(AGY_SESSION_MAP_FILE, "utf-8");
    const map = JSON.parse(raw);
    return map[sessionId];
  } catch {
    return undefined;
  }
}

export async function getAgySessionId(sessionId: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(AGY_SESSION_MAP_FILE, "utf-8");
    const map = JSON.parse(raw);
    return map[sessionId];
  } catch {
    return undefined;
  }
}

export async function saveAgySessionId(sessionId: string, agyId: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(AGY_SESSION_MAP_FILE), { recursive: true });
    let map: Record<string, string> = {};
    try {
      const raw = await fs.readFile(AGY_SESSION_MAP_FILE, "utf-8");
      map = JSON.parse(raw);
    } catch {}
    map[sessionId] = agyId;
    await fs.writeFile(AGY_SESSION_MAP_FILE, JSON.stringify(map, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save agy session mapping:", err);
  }
}

export async function detectAgyConvId(): Promise<string | undefined> {
  try {
    const files = await fs.readdir(AGY_LOG_DIR);
    const logFiles = files.filter(f => f.startsWith("cli-") && f.endsWith(".log")).sort();
    if (logFiles.length === 0) return undefined;

    const latest = path.join(AGY_LOG_DIR, logFiles[logFiles.length - 1]);
    const content = await fs.readFile(latest, "utf-8");
    const match = content.match(CONV_ID_RE);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Adapter for Antigravity (agy).
 */
export class AntigravityAgent extends BaseAgent {
  readonly name = "antigravity";

  getCommand({ prompt, sessionId }: Omit<AgentRunOptions, "onOutput">): string {
    const fullPrompt = this.getSystemPrompt(prompt);
    const escapedPrompt = fullPrompt.replace(/"/g, '\\"');
    if (sessionId) {
      const agyId = getAgySessionIdSync(sessionId);
      if (agyId) {
        return `agy --conversation "${agyId}" --prompt "${escapedPrompt}" --dangerously-skip-permissions`;
      }
    }
    return `agy --prompt "${escapedPrompt}" --dangerously-skip-permissions`;
  }

  async run({ prompt, repoPath, onOutput, sessionId, isResume }: AgentRunOptions): Promise<AgentResult> {
    const { spawn } = await import("child_process");
    const command = this.getCommand({ prompt, repoPath, sessionId, isResume });
    const hasAgyId = sessionId ? !!getAgySessionIdSync(sessionId) : false;

    return new Promise((resolve) => {
      const proc = spawn("bash", ["-c", command], {
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
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("Warning: conversation")) {
            onOutput?.(line);
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        errorOutput += text;
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("Warning: conversation")) {
            onOutput?.(`[stderr] ${line}`);
          }
        }
      });

      proc.on("close", async (code) => {
        const success = code === 0;

        if (!hasAgyId && sessionId) {
          const convId = await detectAgyConvId();
          if (convId) {
            await saveAgySessionId(sessionId, convId);
          }
        }

        resolve({
          success,
          output,
          error: success ? undefined : errorOutput || `Process exited with code ${code}`,
          command,
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          output,
          error: err.message,
          command,
        });
      });
    });
  }
}
