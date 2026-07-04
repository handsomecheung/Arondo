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

interface TokenConfig {
  admin: Record<string, string>; // token -> name
  user: Record<string, string>;  // token -> name
}

let cachedTokens: TokenConfig = { admin: {}, user: {} };

// Convert legacy array structure to new dictionary structure if needed
function migrateConfig(rawConfig: any): TokenConfig {
  const config: TokenConfig = { admin: {}, user: {} };

  if (rawConfig && typeof rawConfig === "object") {
    // Migrate admin
    if (Array.isArray(rawConfig.admin)) {
      rawConfig.admin.forEach((t: string) => {
        config.admin[t] = "Default Admin";
      });
    } else if (rawConfig.admin && typeof rawConfig.admin === "object") {
      config.admin = rawConfig.admin;
    }

    // Migrate user
    if (Array.isArray(rawConfig.user)) {
      rawConfig.user.forEach((t: string) => {
        config.user[t] = "Default User";
      });
    } else if (rawConfig.user && typeof rawConfig.user === "object") {
      config.user = rawConfig.user;
    }
  }

  return config;
}

export async function initializeAuth(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    let exists = false;
    try {
      await fs.access(TOKENS_FILE);
      exists = true;
    } catch {}

    let config: TokenConfig = { admin: {}, user: {} };
    if (exists) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      try {
        const parsed = JSON.parse(raw);
        config = migrateConfig(parsed);
      } catch {
        // Fallback for corrupted json
      }
    }

    if (Object.keys(config.admin).length === 0) {
      const generatedAdminToken = `admin_${crypto.randomBytes(16).toString("hex")}`;
      config.admin[generatedAdminToken] = "Default Admin";
      await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");
      
      console.log("\n========================================================");
      console.log(`🔑 GENERATED ADMIN ACCESS TOKEN:\n\n   ${generatedAdminToken}\n`);
      console.log("   Please save this token. It has been written to tokens.json");
      console.log("========================================================\n");
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
  return req.headers.get("x-arondo-token");
}

export function getRoleByToken(token: string | null): "admin" | "user" | null {
  if (!token) return null;

  try {
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = fsSync.readFileSync(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const config = migrateConfig(parsed);
      
      if (config.admin[token] !== undefined) return "admin";
      if (config.user[token] !== undefined) return "user";
    }
  } catch (err) {
    console.error("[auth] Failed to read tokens.json dynamically:", err);
  }

  if (cachedTokens.admin[token] !== undefined) return "admin";
  if (cachedTokens.user[token] !== undefined) return "user";
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
