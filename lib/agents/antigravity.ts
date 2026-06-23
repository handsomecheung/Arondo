import { spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { BaseAgent, AgentRunOptions, AgentResult } from "./base";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const AGY_SESSION_MAP_FILE = path.join(DATA_DIR, "agy-sessions.json");

// Helper to load session mapping asynchronously
async function getAgySessionId(sessionId: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(AGY_SESSION_MAP_FILE, "utf-8");
    const map = JSON.parse(raw);
    return map[sessionId];
  } catch {
    return undefined;
  }
}

// Helper to load session mapping synchronously
function getAgySessionIdSync(sessionId: string): string | undefined {
  try {
    const raw = fsSync.readFileSync(AGY_SESSION_MAP_FILE, "utf-8");
    const map = JSON.parse(raw);
    return map[sessionId];
  } catch {
    return undefined;
  }
}

// Helper to save session mapping
async function saveAgySessionId(sessionId: string, agyId: string): Promise<void> {
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
    const fullPrompt = this.getSystemPrompt(prompt);
    
    // 1. Resolve agy session ID
    let agyId: string | undefined = undefined;
    if (sessionId) {
      agyId = await getAgySessionId(sessionId);
    }

    // 2. Prepare brain directories baseline if starting a new conversation
    const brainDir = path.join(os.homedir(), ".gemini", "antigravity-cli", "brain");
    const existingBrainDirs = new Set<string>();
    if (!agyId) {
      try {
        const entries = await fs.readdir(brainDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            existingBrainDirs.add(entry.name);
          }
        }
      } catch (err) {
        console.error("Failed to read brain directory baseline:", err);
      }
    }

    // 3. Prepare args
    const args: string[] = [];
    if (agyId) {
      args.push("--conversation", agyId);
    }
    args.push(
      "--prompt", fullPrompt,
      "--dangerously-skip-permissions"
    );

    // 4. Run process
    return new Promise((resolve) => {
      const proc = spawn("agy", args, {
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
          if (trimmed) {
            if (trimmed.startsWith("Warning: conversation")) {
              continue;
            }
            onOutput?.(line);
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        errorOutput += text;
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) {
            if (trimmed.startsWith("Warning: conversation")) {
              continue;
            }
            onOutput?.(`[stderr] ${line}`);
          }
        }
      });

      proc.on("close", async (code) => {
        const success = code === 0;

        // 5. If we started a new conversation, detect the newly created brain directory
        if (!agyId && sessionId) {
          try {
            const currentEntries = await fs.readdir(brainDir, { withFileTypes: true });
            for (const entry of currentEntries) {
              if (entry.isDirectory() && !existingBrainDirs.has(entry.name)) {
                agyId = entry.name;
                await saveAgySessionId(sessionId, agyId);
                break;
              }
            }
          } catch (err) {
            console.error("Failed to detect new brain directory:", err);
          }
        }

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
