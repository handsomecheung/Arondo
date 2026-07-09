import { NextRequest } from "next/server";
import { runnerManager } from "./runner-manager";
import { getSession, getProject } from "./store";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { getConfigDir } from "./config";

const CONFIG_DIR = getConfigDir();
const TOKENS_FILE = path.join(CONFIG_DIR, "tokens.json");

export interface TokenInfo {
  token: string;
  uuid: string;
  name: string;
  type: "admin" | "user";
}

export interface RunnerTokenInfo {
  id: string;
  token: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
  // Locked to the first runner identity (name@hostname derived id) that
  // successfully authenticates with this token, so a leaked token can't be
  // replayed to impersonate a different, already-registered runner.
  boundRunnerId?: string | null;
}

export interface TokensConfig {
  clients: TokenInfo[];
  runners: RunnerTokenInfo[];
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
    }
  } catch (err) {
    console.error("[auth] Failed to read tokens config:", err);
  }
  return { clients, runners };
}

export async function writeTokensConfig(config: TokensConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function initializeAuth(): Promise<void> {
  try {
    const config = await readTokensConfig();

    const hasAdmin = config.clients.some((t) => t.type === "admin");
    if (!hasAdmin) {
      const generatedAdminToken = generateToken();
      config.clients.push({
        token: generatedAdminToken,
        uuid: generateUUID(),
        name: "Default Admin",
        type: "admin",
      });

      console.log("\n========================================================");
      console.log(`🔑 GENERATED ADMIN ACCESS TOKEN:\n\n   ${generatedAdminToken}\n`);
      console.log("   Please save this token. It has been written to tokens.json");
      console.log("========================================================\n");
    }

    await writeTokensConfig(config);
    cachedTokens = config.clients;
  } catch (err) {
    console.error("[auth] Failed to initialize tokens.json:", err);
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
    console.error("[auth] Failed to read tokens.json dynamically:", err);
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
    console.error("[auth] Failed to read tokens.json dynamically for UUID:", err);
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
// false if the token is unknown/revoked, or if it's already bound to a
// different runner (blocks token replay to hijack another runner's identity).
export async function bindRunnerToken(tokenId: string, runnerId: string): Promise<boolean> {
  const config = await readTokensConfig();
  const record = config.runners.find((r) => r.id === tokenId);
  if (!record) return false;
  if (record.boundRunnerId && record.boundRunnerId !== runnerId) return false;

  record.boundRunnerId = runnerId;
  record.lastUsedAt = Date.now();
  await writeTokensConfig(config);
  return true;
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
