import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getConfigDir } from "../config";
import { withFileLock, writeJsonAtomic } from "../fileLock";
import type { AutoModelEffort } from "../llm/automodel/types";

const CONFIG_DIR = getConfigDir();
export const GEN_DIR = path.join(CONFIG_DIR, "gen");
const GEN_MESSAGES_FILE = path.join(GEN_DIR, "messages.json");
const GEN_MEMORY_FILE = path.join(GEN_DIR, "memory.json");

export interface GenSubAgentRunInfo {
  subSessionId: string;
  messageId?: string;
  runnerId: string;
  runnerName?: string;
  repoPath: string;
  noProject?: boolean;
  agentType: string;
  model?: string;
  effort?: AutoModelEffort;
  status: "running" | "done" | "error" | "stopped";
  prompt: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface GenMessage {
  id: string;
  role: "user" | "gen";
  content: string;
  createdAt: string;
  tokenUuid?: string;
  userName?: string;
  userColor?: string;
  subAgent?: GenSubAgentRunInfo;
}

export interface GenMemory {
  summary: string;
  facts: string[];
  lastRunnerId?: string;
  lastRepoPath?: string;
  compactedMessageCount: number;
  updatedAt: string;
}

const DEFAULT_MEMORY: GenMemory = {
  summary: "",
  facts: [],
  compactedMessageCount: 0,
  updatedAt: new Date(0).toISOString(),
};

async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[gen/store] readJson error path=${filePath}:`, err);
    }
    return defaultValue;
  }
}

async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, data);
}

export async function getGenMessages(): Promise<GenMessage[]> {
  return readJson<GenMessage[]>(GEN_MESSAGES_FILE, []);
}

export async function addGenMessage(
  msg: Omit<GenMessage, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<GenMessage> {
  return withFileLock(GEN_MESSAGES_FILE, async () => {
    const messages = await readJson<GenMessage[]>(GEN_MESSAGES_FILE, []);
    const record: GenMessage = {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      createdAt: msg.createdAt || new Date().toISOString(),
    };
    messages.push(record);
    await writeJson(GEN_MESSAGES_FILE, messages);
    return record;
  });
}

export async function updateGenMessage(
  id: string,
  patch: Partial<GenMessage>,
): Promise<GenMessage | null> {
  return withFileLock(GEN_MESSAGES_FILE, async () => {
    const messages = await readJson<GenMessage[]>(GEN_MESSAGES_FILE, []);
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    messages[idx] = { ...messages[idx], ...patch };
    await writeJson(GEN_MESSAGES_FILE, messages);
    return messages[idx];
  });
}

export async function getGenMemory(): Promise<GenMemory> {
  return readJson<GenMemory>(GEN_MEMORY_FILE, { ...DEFAULT_MEMORY });
}

export async function updateGenMemory(
  patch: Partial<GenMemory>,
): Promise<GenMemory> {
  return withFileLock(GEN_MEMORY_FILE, async () => {
    const current = await readJson<GenMemory>(GEN_MEMORY_FILE, { ...DEFAULT_MEMORY });
    const next: GenMemory = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(GEN_MEMORY_FILE, next);
    return next;
  });
}
