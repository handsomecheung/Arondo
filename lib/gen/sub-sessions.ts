import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getConfigDir } from "../config";
import type { Session } from "../store";

const CONFIG_DIR = getConfigDir();
const genSubSessionDirCache = new Map<string, string>();

export function getDefaultClientId(): string {
  try {
    const tokensFile = path.join(CONFIG_DIR, "arondo.json");
    if (fsSync.existsSync(tokensFile)) {
      const raw = fsSync.readFileSync(tokensFile, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.clients) && parsed.clients.length > 0) {
        const uuid = parsed.clients[0]?.uuid;
        if (uuid && typeof uuid === "string" && uuid.trim()) {
          return uuid.trim();
        }
      }
    }
  } catch {}
  return "default";
}

export function isGenSubSessionId(id: string): boolean {
  return id.startsWith("gen-sub-");
}

export function deleteGenSubSessionCache(id: string): void {
  genSubSessionDirCache.delete(id);
}

export function registerGenSubSession(id: string, clientId?: string | null): void {
  if (!id) return;
  const safeClient = clientId && clientId.trim() ? clientId.trim() : getDefaultClientId();
  const targetDir = path.join(CONFIG_DIR, "gen", safeClient, "sessions", id);
  genSubSessionDirCache.set(id, targetDir);
}

export function findGenSubSessionDir(id: string, clientId?: string | null): string {
  if (clientId && clientId.trim()) {
    const targetDir = path.join(CONFIG_DIR, "gen", clientId.trim(), "sessions", id);
    genSubSessionDirCache.set(id, targetDir);
    return targetDir;
  }

  const cached = genSubSessionDirCache.get(id);
  if (cached && fsSync.existsSync(cached)) return cached;

  const genBaseDir = path.join(CONFIG_DIR, "gen");
  if (fsSync.existsSync(genBaseDir)) {
    try {
      const entries = fsSync.readdirSync(genBaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "sessions" || entry.name === "default") continue;
        const candidate = path.join(genBaseDir, entry.name, "sessions", id);
        if (fsSync.existsSync(candidate)) {
          genSubSessionDirCache.set(id, candidate);
          return candidate;
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  const legacyDir = path.join(CONFIG_DIR, "gen", "sessions", id);
  if (fsSync.existsSync(legacyDir)) {
    genSubSessionDirCache.set(id, legacyDir);
    return legacyDir;
  }

  const safeClient = getDefaultClientId();
  const newDir = path.join(CONFIG_DIR, "gen", safeClient, "sessions", id);
  genSubSessionDirCache.set(id, newDir);
  return newDir;
}

export async function migrateLegacyDefaultGenDir(): Promise<void> {
  const defaultDir = path.join(CONFIG_DIR, "gen", "default");
  if (!fsSync.existsSync(defaultDir)) return;
  const fallbackClient = getDefaultClientId();
  const defaultSessionsDir = path.join(defaultDir, "sessions");
  if (fsSync.existsSync(defaultSessionsDir)) {
    try {
      const entries = await fs.readdir(defaultSessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionFile = path.join(defaultSessionsDir, entry.name, "session.json");
        let targetClient = fallbackClient;
        if (fsSync.existsSync(sessionFile)) {
          try {
            const raw = await fs.readFile(sessionFile, "utf-8");
            const sessionData = JSON.parse(raw);
            if (sessionData?.tokenUuid && typeof sessionData.tokenUuid === "string" && sessionData.tokenUuid.trim()) {
              targetClient = sessionData.tokenUuid.trim();
            }
          } catch {}
        }
        const targetSessionsDir = path.join(CONFIG_DIR, "gen", targetClient, "sessions");
        await fs.mkdir(targetSessionsDir, { recursive: true });
        const targetPath = path.join(targetSessionsDir, entry.name);
        if (!fsSync.existsSync(targetPath)) {
          await fs.rename(path.join(defaultSessionsDir, entry.name), targetPath);
          genSubSessionDirCache.set(entry.name, targetPath);
        }
      }
      await fs.rm(defaultSessionsDir, { recursive: true, force: true });
    } catch (err) {
      console.warn("[gen] Failed to migrate default sessions dir:", err);
    }
  }

  const defaultMessages = path.join(defaultDir, "messages.json");
  if (fsSync.existsSync(defaultMessages)) {
    const targetMessages = path.join(CONFIG_DIR, "gen", fallbackClient, "messages.json");
    if (!fsSync.existsSync(targetMessages)) {
      await fs.rename(defaultMessages, targetMessages);
    } else {
      await fs.rm(defaultMessages, { force: true });
    }
  }

  const defaultMemory = path.join(defaultDir, "memory.json");
  if (fsSync.existsSync(defaultMemory)) {
    const targetMemory = path.join(CONFIG_DIR, "gen", fallbackClient, "memory.json");
    if (!fsSync.existsSync(targetMemory)) {
      await fs.rename(defaultMemory, targetMemory);
    } else {
      await fs.rm(defaultMemory, { force: true });
    }
  }

  try {
    const remaining = await fs.readdir(defaultDir);
    if (remaining.length === 0) {
      await fs.rm(defaultDir, { recursive: true, force: true });
    }
  } catch {}
}

export async function readGenSubSessions(
  readJson: <T>(filePath: string, defaultValue: T) => Promise<T>,
  withDerivedSessionError: (session: Session) => Promise<Session>,
  clientId?: string | null
): Promise<Session[]> {
  try {
    await migrateLegacyDefaultGenDir();
    const sessions: Session[] = [];
    const readSessionsFromDir = async (sessionsDir: string) => {
      if (!fsSync.existsSync(sessionsDir)) return;
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const session = await readJson<Session | null>(
            path.join(sessionsDir, entry.name, "session.json"),
            null
          );
          if (session) {
            genSubSessionDirCache.set(session.id, path.join(sessionsDir, entry.name));
            sessions.push(await withDerivedSessionError(session));
          }
        }
      }
    };

    if (clientId && clientId.trim()) {
      await readSessionsFromDir(path.join(CONFIG_DIR, "gen", clientId.trim(), "sessions"));
    } else {
      const genBaseDir = path.join(CONFIG_DIR, "gen");
      if (fsSync.existsSync(genBaseDir)) {
        const clientEntries = await fs.readdir(genBaseDir, { withFileTypes: true });
        for (const ce of clientEntries) {
          if (!ce.isDirectory()) continue;
          if (ce.name === "sessions" || ce.name === "default") continue;
          await readSessionsFromDir(path.join(genBaseDir, ce.name, "sessions"));
        }
      }
      await readSessionsFromDir(path.join(CONFIG_DIR, "gen", "sessions"));
    }

    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}
