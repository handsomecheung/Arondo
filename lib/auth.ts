import { NextRequest } from "next/server";
import { runnerManager } from "./runner-manager";
import { getSession, getProject } from "./store";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { getConfigDir } from "./config";
import { withFileLock, writeJsonAtomic } from "./fileLock";

const CONFIG_DIR = getConfigDir();
const TOKENS_FILE = path.join(CONFIG_DIR, "arondo.json");

export interface TokenInfo {
  token: string;
  uuid: string;
  name: string;
  type: "admin" | "user";
  color?: string;
}

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#a855f7", // Purple
  "#f97316", // Orange
  "#22c55e", // Green
];

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
}

export function generateUniqueColor(existingColors: string[]): string {
  const normalizedExisting = existingColors.map(c => c.toLowerCase());
  for (const color of PRESET_COLORS) {
    if (!normalizedExisting.includes(color.toLowerCase())) {
      return color;
    }
  }

  const hues = existingColors
    .filter(c => /^#[0-9a-fA-F]{6}$/.test(c))
    .map(c => hexToHue(c));

  if (hues.length === 0) {
    return PRESET_COLORS[0];
  }

  const uniqueHues = Array.from(new Set(hues)).sort((a, b) => a - b);

  if (uniqueHues.length === 1) {
    return hslToHex((uniqueHues[0] + 180) % 360, 85, 55);
  }

  let maxGap = 0;
  let targetHue = 0;

  for (let i = 0; i < uniqueHues.length; i++) {
    const current = uniqueHues[i];
    const next = uniqueHues[(i + 1) % uniqueHues.length];
    let gap = next - current;
    if (gap < 0) {
      gap += 360;
    }
    if (gap > maxGap) {
      maxGap = gap;
      targetHue = (current + gap / 2) % 360;
    }
  }

  return hslToHex(targetHue, 85, 55);
}

export interface RunnerTokenInfo {
  id: string;
  token: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
  // Locked to the first runner identity (server-generated id) that
  // successfully authenticates with this token, so a leaked token can't be
  // replayed to impersonate a different, already-registered runner. This
  // token's `name` is also the runner's display name across the system.
  boundRunnerId?: string | null;
}

export interface ArondoSettings {
  sessionArchiveDays?: number;
  showHiddenFiles?: boolean;
  mrouterApiKeys?: {
    ANTHROPIC_API_KEY?: string;
    OPENAI_API_KEY?: string;
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
  };
}

export interface TokensConfig {
  clients: TokenInfo[];
  runners: RunnerTokenInfo[];
  setitngs?: ArondoSettings;
}

let cachedTokens: TokenInfo[] = [];

function generateUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return generateToken();
}

export function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Constant-time string comparison so token checks don't leak timing
// information about how many leading bytes matched. When lengths differ we
// still run a same-length comparison to avoid a fast-path short-circuit.
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function readTokensConfig(): Promise<TokensConfig> {
  let clients: TokenInfo[] = [];
  let runners: RunnerTokenInfo[] = [];
  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.clients)) clients = parsed.clients;
      if (Array.isArray(parsed?.runners)) runners = parsed.runners;
      const setitngs = typeof parsed?.setitngs === "object" && parsed.setitngs !== null
        ? parsed.setitngs
        : undefined;
      return { clients, runners, setitngs };
    }
  } catch (err) {
    console.error("[auth] Failed to read tokens config:", err);
  }
  return { clients, runners };
}

export async function writeTokensConfig(config: TokensConfig): Promise<void> {
  await writeJsonAtomic(TOKENS_FILE, config);
}

// Runs `mutator` under a per-file lock against arondo.json, serialized
// against every other reader/writer of this helper (including
// bindRunnerToken and the runner/client token API routes) so concurrent
// runner reconnects or admin edits can't race into a lost update or
// corrupt the file that gates all authentication.
export async function updateTokensConfig<T>(
  mutator: (config: TokensConfig) => T | Promise<T>
): Promise<T> {
  return withFileLock(TOKENS_FILE, async () => {
    const config = await readTokensConfig();
    const result = await mutator(config);
    await writeTokensConfig(config);
    return result;
  });
}

export async function initializeAuth(): Promise<void> {
  try {
    await updateTokensConfig((config) => {
      const hasAdmin = config.clients.some((t) => t.type === "admin");
      if (!hasAdmin) {
        const generatedAdminToken = generateToken();
        config.clients.push({
          token: generatedAdminToken,
          uuid: generateUUID(),
          name: "Default Admin",
          type: "admin",
          color: "#3b82f6",
        });

        console.log("\n========================================================");
        console.log(`🔑 GENERATED ADMIN ACCESS TOKEN:\n\n   ${generatedAdminToken}\n`);
        console.log("   Please save this token. It has been written to arondo.json");
        console.log("========================================================\n");
      }
    });

    const config = await readTokensConfig();
    cachedTokens = config.clients;
  } catch (err) {
    console.error("[auth] Failed to initialize arondo.json:", err);
  }
}

export async function reloadTokens(): Promise<void> {
  const config = await readTokensConfig();
  cachedTokens = config.clients;
}

export function getArondoToken(req: NextRequest): string | null {
  const header = req.headers.get("x-arondo-token");
  if (header) return header;
  return req.nextUrl.searchParams.get("token");
}

export function getRoleByToken(token: string | null): "admin" | "user" | null {
  if (!token) return null;

  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = fsSync.readFileSync(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const clients: TokenInfo[] = Array.isArray(parsed?.clients) ? parsed.clients : [];
      const found = clients.find((t) => t.token === token);
      if (found) return found.type;
    }
  } catch (err) {
    console.error("[auth] Failed to read arondo.json dynamically:", err);
  }

  const foundCached = cachedTokens.find((t) => t.token === token);
  if (foundCached) return foundCached.type;
  return null;
}

export function getUuidByToken(token: string | null): string | null {
  if (!token) return null;

  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = fsSync.readFileSync(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const clients: TokenInfo[] = Array.isArray(parsed?.clients) ? parsed.clients : [];
      const found = clients.find((t) => t.token === token);
      if (found) return found.uuid;
    }
  } catch (err) {
    console.error("[auth] Failed to read arondo.json dynamically for UUID:", err);
  }

  const foundCached = cachedTokens.find((t) => t.token === token);
  if (foundCached) return foundCached.uuid;
  return null;
}

// Looks up a runner token by value using a constant-time comparison against
// every configured runner token, so an attacker can't use response timing to
// narrow down a valid token byte-by-byte.
export async function findRunnerTokenByToken(token: string | null): Promise<RunnerTokenInfo | null> {
  if (!token) return null;
  const { runners } = await readTokensConfig();
  let match: RunnerTokenInfo | null = null;
  for (const r of runners) {
    if (timingSafeEqualStrings(token, r.token)) {
      match = r;
    }
  }
  return match;
}

// Locks a runner token to the runner identity it first registers as. Returns
// the token record (whose `name` becomes the runner's display name) on
// success, or null if the token is unknown/revoked, or if it's already bound
// to a different runner (blocks token replay to hijack another runner's
// identity).
export async function bindRunnerToken(tokenId: string, runnerId: string): Promise<RunnerTokenInfo | null> {
  return updateTokensConfig((config) => {
    const record = config.runners.find((r) => r.id === tokenId);
    if (!record) return null;
    if (record.boundRunnerId && record.boundRunnerId !== runnerId) return null;

    record.boundRunnerId = runnerId;
    record.lastUsedAt = Date.now();
    return record;
  });
}

export function isValidToken(token: string | null): boolean {
  return getRoleByToken(token) !== null;
}

export async function verifyRunnerPermission(
  runnerId: string,
  token: string | null
): Promise<boolean> {
  if (!runnerId) return false;
  if (!isValidToken(token)) return false;
  return runnerManager.isTokenAllowedForRunnerId(runnerId, token);
}

export async function verifySessionPermission(
  sessionId: string,
  token: string | null
): Promise<boolean> {
  if (!sessionId) return false;
  const session = await getSession(sessionId);
  if (!session) return false;
  return verifyRunnerPermission(session.runnerId, token);
}

export async function verifyProjectPermission(
  projectId: string,
  token: string | null
): Promise<boolean> {
  if (!projectId) return false;
  const project = await getProject(projectId);
  if (!project) return false;
  return verifyRunnerPermission(project.runnerId, token);
}
