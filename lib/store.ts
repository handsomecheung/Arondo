import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const DELETED_SESSIONS_DIR = path.join(DATA_DIR, "deleted-sessions");

export type SessionStatus = "idle" | "running" | "done" | "error";

export interface Session {
  id: string;
  status: SessionStatus;
  prompt: string;
  agentType: string;
  repoPath: string;
  prUrl?: string;
  errorMessage?: string;
  command?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionDir(id: string): string {
  return path.join(SESSIONS_DIR, id);
}

function getSessionFilePath(id: string): string {
  return path.join(getSessionDir(id), "session.json");
}

function getMessagesFilePath(id: string): string {
  return path.join(getSessionDir(id), "messages.json");
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  try {
    await ensureDir(SESSIONS_DIR);
    const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const sessions: Session[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = getSessionFilePath(entry.name);
        try {
          const session = await readJson<Session | null>(filePath, null);
          if (session) {
            sessions.push(session);
          }
        } catch {
          // Ignore corrupt metadata
        }
      }
    }
    
    // Sort by most recent first
    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session | undefined> {
  const filePath = getSessionFilePath(id);
  const session = await readJson<Session | null>(filePath, null);
  return session || undefined;
}

export async function createSession(
  data: Omit<Session, "id" | "createdAt" | "updatedAt">
): Promise<Session> {
  const id = crypto.randomUUID();
  const session: Session = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Save session metadata inside its own folder
  await writeJson(getSessionFilePath(id), session);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<Session, "id" | "createdAt">>
): Promise<Session | undefined> {
  const session = await getSession(id);
  if (!session) return undefined;
  
  const updated: Session = {
    ...session,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  
  await writeJson(getSessionFilePath(id), updated);
  return updated;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(sessionId: string): Promise<Message[]> {
  return readJson<Message[]>(getMessagesFilePath(sessionId), []);
}

export async function addMessage(
  data: Omit<Message, "id" | "createdAt">
): Promise<Message> {
  const { sessionId } = data;
  const all = await getMessages(sessionId);
  const message: Message = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all.push(message);
  await writeJson(getMessagesFilePath(sessionId), all);
  return message;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function getLogFilePath(sessionId: string, messageId: string): string {
  return path.join(getSessionDir(sessionId), "logs", `${messageId}.log`);
}

export async function clearSessionLog(sessionId: string, messageId: string): Promise<void> {
  const logPath = getLogFilePath(sessionId, messageId);
  await ensureDir(path.dirname(logPath));
  await fs.writeFile(logPath, "", "utf-8");
}

export async function appendSessionLog(sessionId: string, messageId: string, text: string): Promise<void> {
  const logPath = getLogFilePath(sessionId, messageId);
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, text + "\n", "utf-8");
}

export async function getSessionLog(sessionId: string, messageId: string): Promise<string> {
  try {
    return await fs.readFile(getLogFilePath(sessionId, messageId), "utf-8");
  } catch {
    return "";
  }
}

export async function deleteSession(id: string): Promise<void> {
  const sessionDir = getSessionDir(id);
  const deletedDir = path.join(DELETED_SESSIONS_DIR, id);
  await ensureDir(DELETED_SESSIONS_DIR);
  try {
    await fs.rename(sessionDir, deletedDir);
  } catch {
    // Fallback: Copy and Delete
    await fs.cp(sessionDir, deletedDir, { recursive: true });
    await fs.rm(sessionDir, { recursive: true, force: true });
  }
}

