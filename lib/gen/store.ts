import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { getConfigDir } from "../config";
import { withFileLock, writeJsonAtomic } from "../fileLock";
import type { AutoModelEffort } from "../llm/automodel/types";
import { getDefaultClientId } from "./sub-sessions";

const CONFIG_DIR = getConfigDir();
export const GEN_DIR = path.join(CONFIG_DIR, "gen");

export function getGenDir(clientId?: string | null): string {
  const safeId = clientId && clientId.trim() ? clientId.trim() : getDefaultClientId();
  return path.join(GEN_DIR, safeId);
}

function getGenMessagesFile(clientId?: string | null): string {
  return path.join(getGenDir(clientId), "messages.json");
}

function getGenMemoryFile(clientId?: string | null): string {
  return path.join(getGenDir(clientId), "memory.json");
}

export async function getAllGenClientIds(): Promise<string[]> {
  try {
    if (!fsSync.existsSync(GEN_DIR)) return [];
    const entries = await fs.readdir(GEN_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== "sessions" && e.name !== "default")
      .map((e) => e.name);
  } catch {
    return [];
  }
}

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
  turnNumber?: number;
  isContinuedSession?: boolean;
  continuedFromGenMessageId?: string;
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

async function readGenMessagesWithMigration(clientId?: string | null): Promise<GenMessage[]> {
  const targetFile = getGenMessagesFile(clientId);
  if (fsSync.existsSync(targetFile)) {
    return readJson<GenMessage[]>(targetFile, []);
  }
  const legacyFile = path.join(GEN_DIR, "messages.json");
  if (fsSync.existsSync(legacyFile)) {
    const legacy = await readJson<GenMessage[]>(legacyFile, []);
    if (legacy.length > 0) {
      await writeJson(targetFile, legacy);
      return legacy;
    }
  }
  return [];
}

async function readGenMemoryWithMigration(clientId?: string | null): Promise<GenMemory> {
  const targetFile = getGenMemoryFile(clientId);
  if (fsSync.existsSync(targetFile)) {
    return readJson<GenMemory>(targetFile, { ...DEFAULT_MEMORY });
  }
  const legacyFile = path.join(GEN_DIR, "memory.json");
  if (fsSync.existsSync(legacyFile)) {
    const legacy = await readJson<GenMemory>(legacyFile, { ...DEFAULT_MEMORY });
    await writeJson(targetFile, legacy);
    return legacy;
  }
  return { ...DEFAULT_MEMORY };
}

export async function getGenMessages(clientId?: string | null): Promise<GenMessage[]> {
  return readGenMessagesWithMigration(clientId);
}

export async function addGenMessage(
  msg: Omit<GenMessage, "id" | "createdAt"> & { id?: string; createdAt?: string },
  clientId?: string | null,
): Promise<GenMessage> {
  const effectiveClientId = clientId ?? msg.tokenUuid ?? null;
  const targetFile = getGenMessagesFile(effectiveClientId);
  return withFileLock(targetFile, async () => {
    const messages = await readGenMessagesWithMigration(effectiveClientId);
    const record: GenMessage = {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      createdAt: msg.createdAt || new Date().toISOString(),
      ...(effectiveClientId && !msg.tokenUuid ? { tokenUuid: effectiveClientId } : {}),
    };
    messages.push(record);
    await writeJson(targetFile, messages);
    return record;
  });
}

export async function updateGenMessage(
  id: string,
  patch: Partial<GenMessage>,
  clientId?: string | null,
): Promise<GenMessage | null> {
  if (clientId) {
    const targetFile = getGenMessagesFile(clientId);
    return withFileLock(targetFile, async () => {
      const messages = await readGenMessagesWithMigration(clientId);
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      messages[idx] = { ...messages[idx], ...patch };
      await writeJson(targetFile, messages);
      return messages[idx];
    });
  }

  const clientIds = await getAllGenClientIds();
  const searchDirs = clientIds.length > 0 ? clientIds : [getDefaultClientId()];
  for (const cid of searchDirs) {
    const targetFile = getGenMessagesFile(cid);
    if (!fsSync.existsSync(targetFile)) continue;
    const res = await withFileLock(targetFile, async () => {
      const messages = await readGenMessagesWithMigration(cid);
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      messages[idx] = { ...messages[idx], ...patch };
      await writeJson(targetFile, messages);
      return messages[idx];
    });
    if (res) return res;
  }
  return null;
}

export async function getGenMemory(clientId?: string | null): Promise<GenMemory> {
  return readGenMemoryWithMigration(clientId);
}

export async function updateGenMemory(
  patch: Partial<GenMemory>,
  clientId?: string | null,
): Promise<GenMemory> {
  const targetFile = getGenMemoryFile(clientId);
  return withFileLock(targetFile, async () => {
    const current = await readGenMemoryWithMigration(clientId);
    const next: GenMemory = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(targetFile, next);
    return next;
  });
}
