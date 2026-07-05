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

export function migrateConfig(rawConfig: any): TokenInfo[] {
  if (Array.isArray(rawConfig)) {
    return rawConfig.map((item: any) => ({
      token: String(item.token || ""),
      uuid: String(item.uuid || generateUUID()),
      name: String(item.name || ""),
      type: item.type === "admin" ? "admin" : "user",
    }));
  }

  const list: TokenInfo[] = [];
  if (rawConfig && typeof rawConfig === "object") {
    // Migrate admin
    if (rawConfig.admin) {
      if (Array.isArray(rawConfig.admin)) {
        rawConfig.admin.forEach((t: string) => {
          list.push({
            token: t,
            uuid: generateUUID(),
            name: "Default Admin",
            type: "admin",
          });
        });
      } else if (typeof rawConfig.admin === "object") {
        for (const [t, name] of Object.entries(rawConfig.admin)) {
          list.push({
            token: t,
            uuid: generateUUID(),
            name: String(name || "Default Admin"),
            type: "admin",
          });
        }
      }
    }

    // Migrate user
    if (rawConfig.user) {
      if (Array.isArray(rawConfig.user)) {
        rawConfig.user.forEach((t: string) => {
          list.push({
            token: t,
            uuid: generateUUID(),
            name: "Default User",
            type: "user",
          });
        });
      } else if (typeof rawConfig.user === "object") {
        for (const [t, name] of Object.entries(rawConfig.user)) {
          list.push({
            token: t,
            uuid: generateUUID(),
            name: String(name || "Default User"),
            type: "user",
          });
        }
      }
    }
  }

  return list;
}

export async function initializeAuth(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    let exists = false;
    try {
      await fs.access(TOKENS_FILE);
      exists = true;
    } catch {}

    let config: TokenInfo[] = [];
    if (exists) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      try {
        const parsed = JSON.parse(raw);
        config = migrateConfig(parsed);
      } catch {
        // Fallback for corrupted json
      }
    }

    const hasAdmin = config.some(t => t.type === "admin");
    if (!hasAdmin) {
      const generatedAdminToken = generateToken();
      config.push({
        token: generatedAdminToken,
        uuid: generateUUID(),
        name: "Default Admin",
        type: "admin"
      });
      await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");
      
      console.log("\n========================================================");
      console.log(`🔑 GENERATED ADMIN ACCESS TOKEN:\n\n   ${generatedAdminToken}\n`);
      console.log("   Please save this token. It has been written to tokens.json");
      console.log("========================================================\n");
    } else {
      // Write back migrated config to enforce new format on start
      await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");
    }

    cachedTokens = config;
  } catch (err) {
    console.error("[auth] Failed to initialize tokens.json:", err);
  }
}

export async function reloadTokens(): Promise<void> {
  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      cachedTokens = migrateConfig(parsed);
    }
  } catch {}
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
      const config = migrateConfig(parsed);
      
      const found = config.find(t => t.token === token);
      if (found) return found.type;
    }
  } catch (err) {
    console.error("[auth] Failed to read tokens.json dynamically:", err);
  }

  const foundCached = cachedTokens.find(t => t.token === token);
  if (foundCached) return foundCached.type;
  return null;
}

export function getUuidByToken(token: string | null): string | null {
  if (!token) return null;

  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = fsSync.readFileSync(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const config = migrateConfig(parsed);
      
      const found = config.find(t => t.token === token);
      if (found) return found.uuid;
    }
  } catch (err) {
    console.error("[auth] Failed to read tokens.json dynamically for UUID:", err);
  }

  const foundCached = cachedTokens.find(t => t.token === token);
  if (foundCached) return foundCached.uuid;
  return null;
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
