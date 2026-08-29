import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";
import { updateAppSettings, getAppSettings, getSessionArchiveDays, getShowHiddenFiles, getShowTempDirSessions, getEnableAutomodel } from "@/lib/store";
import { getLlmApiKeyEnvStatus, type LlmApiKeyName } from "@/lib/automodel/config";
import fs from "fs/promises";
import path from "path";

const LLM_API_KEY_NAMES: LlmApiKeyName[] = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
];

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionArchiveDays = await getSessionArchiveDays();
  const showHiddenFiles = await getShowHiddenFiles();
  const showTempDirSessions = await getShowTempDirSessions();
  const enableAutomodel = await getEnableAutomodel();
  const appSettings = await getAppSettings();
  const envStatus = getLlmApiKeyEnvStatus();
  const llmApiKeys = Object.fromEntries(
    LLM_API_KEY_NAMES.map((name) => {
      const saved = !!appSettings.llmApiKeys?.[name]?.trim();
      const env = envStatus[name];
      return [name, {
        configured: env || saved,
        source: env ? "env" : saved ? "settings" : "none",
        env,
      }];
    }),
  );

  let version = "unknown";
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    version = packageJson.version || "unknown";
  } catch (err) {
    console.error("Failed to read package.json version:", err);
  }

  return NextResponse.json({ sessionArchiveDays, showHiddenFiles, showTempDirSessions, enableAutomodel, version, llmApiKeys });
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { sessionArchiveDays, showHiddenFiles, showTempDirSessions, enableAutomodel, llmApiKeys } = await request.json();
  if (sessionArchiveDays !== undefined) {
    if (typeof sessionArchiveDays !== "number" || !Number.isFinite(sessionArchiveDays) || sessionArchiveDays < 1) {
      return NextResponse.json({ error: "sessionArchiveDays must be a positive number" }, { status: 400 });
    }
  }
  if (showHiddenFiles !== undefined && typeof showHiddenFiles !== "boolean") {
    return NextResponse.json({ error: "showHiddenFiles must be a boolean" }, { status: 400 });
  }
  if (showTempDirSessions !== undefined && typeof showTempDirSessions !== "boolean") {
    return NextResponse.json({ error: "showTempDirSessions must be a boolean" }, { status: 400 });
  }
  if (enableAutomodel !== undefined && typeof enableAutomodel !== "boolean") {
    return NextResponse.json({ error: "enableAutomodel must be a boolean" }, { status: 400 });
  }
  if (llmApiKeys !== undefined && (typeof llmApiKeys !== "object" || llmApiKeys === null || Array.isArray(llmApiKeys))) {
    return NextResponse.json({ error: "llmApiKeys must be an object" }, { status: 400 });
  }

  const patch: {
    sessionArchiveDays?: number;
    showHiddenFiles?: boolean;
    showTempDirSessions?: boolean;
    enableAutomodel?: boolean;
    llmApiKeys?: Partial<Record<LlmApiKeyName, string | undefined>>;
  } = {};
  if (sessionArchiveDays !== undefined) patch.sessionArchiveDays = sessionArchiveDays;
  if (showHiddenFiles !== undefined) patch.showHiddenFiles = showHiddenFiles;
  if (showTempDirSessions !== undefined) patch.showTempDirSessions = showTempDirSessions;
  if (enableAutomodel !== undefined) patch.enableAutomodel = enableAutomodel;
  if (llmApiKeys !== undefined) {
    const current = await getAppSettings();
    const envStatus = getLlmApiKeyEnvStatus();
    const next = { ...(current.llmApiKeys ?? {}) };
    for (const name of LLM_API_KEY_NAMES) {
      if (envStatus[name] || !(name in llmApiKeys)) continue;
      const value = llmApiKeys[name];
      if (value === null || value === "") {
        next[name] = undefined;
      } else if (typeof value === "string") {
        next[name] = value.trim() || undefined;
      } else if (value !== undefined) {
        return NextResponse.json({ error: `${name} must be a string or null` }, { status: 400 });
      }
    }
    patch.llmApiKeys = next;
  }

  const updated = await updateAppSettings(patch);
  const envStatus = getLlmApiKeyEnvStatus();
  const status = Object.fromEntries(
    LLM_API_KEY_NAMES.map((name) => {
      const saved = !!updated.llmApiKeys?.[name]?.trim();
      const env = envStatus[name];
      return [name, {
        configured: env || saved,
        source: env ? "env" : saved ? "settings" : "none",
        env,
      }];
    }),
  );
  return NextResponse.json({ ...updated, enableAutomodel: updated.enableAutomodel !== undefined ? updated.enableAutomodel : false, llmApiKeys: status });
}
