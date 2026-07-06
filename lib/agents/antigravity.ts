import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";
import { getConfigDir } from "../config";

const CONFIG_DIR = getConfigDir();
const AGY_SESSION_MAP_FILE = path.join(CONFIG_DIR, "agy-sessions.json");

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

/**
 * Adapter for Antigravity (agy).
 */
export class AntigravityAgent extends BaseAgent {
  readonly name = "antigravity";

  getCommand({ repoPath, sessionId, model }: Omit<AgentRunOptions, "onOutput">): string {
    const addDirArg = repoPath ? ` --add-dir "${repoPath}"` : "";
    const modelArg = model ? ` --model "${model}"` : "";
    if (sessionId) {
      const agyId = getAgySessionIdSync(sessionId);
      if (agyId) {
        return `agy --conversation "${agyId}" --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg}${modelArg} --dangerously-skip-permissions`;
      }
    }
    return `agy --prompt "$(< "$${PROMPT_ENV_VAR}")"${addDirArg}${modelArg} --dangerously-skip-permissions`;
  }
}
