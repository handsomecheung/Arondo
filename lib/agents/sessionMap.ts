import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getConfigDir } from "../config";
import { withFileLock, writeJsonAtomic } from "../fileLock";

const CONFIG_DIR = getConfigDir();
const AGENTS_SESSION_MAP_FILE = path.join(CONFIG_DIR, "agents-sessions.json");

type AgentSessionMap = {
  agy: Record<string, string>;
  codex: Record<string, string>;
};

function emptyAgentSessionMap(): AgentSessionMap {
  return { agy: {}, codex: {} };
}

function parseAgentSessionMap(raw: string): AgentSessionMap {
  const parsed = JSON.parse(raw);
  return {
    agy: parsed.agy ?? {},
    codex: parsed.codex ?? {},
  };
}

export function getAgentSessionIdSync(agent: keyof AgentSessionMap, sessionId: string): string | undefined {
  try {
    const raw = fsSync.readFileSync(AGENTS_SESSION_MAP_FILE, "utf-8");
    const map = parseAgentSessionMap(raw);
    return map[agent][sessionId];
  } catch {
    return undefined;
  }
}

export async function getAgentSessionId(agent: keyof AgentSessionMap, sessionId: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(AGENTS_SESSION_MAP_FILE, "utf-8");
    const map = parseAgentSessionMap(raw);
    return map[agent][sessionId];
  } catch {
    return undefined;
  }
}

export async function saveAgentSessionId(
  agent: keyof AgentSessionMap,
  sessionId: string,
  agentSessionId: string,
): Promise<void> {
  await withFileLock(AGENTS_SESSION_MAP_FILE, async () => {
    let map = emptyAgentSessionMap();
    try {
      const raw = await fs.readFile(AGENTS_SESSION_MAP_FILE, "utf-8");
      map = parseAgentSessionMap(raw);
    } catch {}
    map[agent][sessionId] = agentSessionId;
    await writeJsonAtomic(AGENTS_SESSION_MAP_FILE, map);
  });
}
