import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";

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

  getCommand({ repoPath, sessionId }: Omit<AgentRunOptions, "onOutput">): string {
    const addDirArg = repoPath ? ` --add-dir "${repoPath}"` : "";
    if (sessionId) {
      const agyId = getAgySessionIdSync(sessionId);
      if (agyId) {
        return `agy --conversation "${agyId}" --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg} --dangerously-skip-permissions`;
      }
    }
    return `agy --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg} --dangerously-skip-permissions`;
  }
}
