import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";
import { updateAppSettings, getAppSettings, getSessionArchiveDays, getShowHiddenFiles, getShowTempDirSessions, getEnableAutomodel, getAgentModelsConfig, type AgentModelsConfig } from "@/lib/store";
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
  const agentModels = await getAgentModelsConfig();
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

  return NextResponse.json({ sessionArchiveDays, showHiddenFiles, showTempDirSessions, enableAutomodel, version, llmApiKeys, agentModels });
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { sessionArchiveDays, showHiddenFiles, showTempDirSessions, enableAutomodel, llmApiKeys, agentModels } = await request.json();
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
  if (agentModels !== undefined) {
    if (typeof agentModels !== "object" || agentModels === null || Array.isArray(agentModels)) {
      return NextResponse.json({ error: "agentModels must be an object" }, { status: 400 });
    }
    if ("antigravity" in agentModels) {
      const agy = agentModels.antigravity;
      if (typeof agy !== "object" || agy === null || Array.isArray(agy)) {
        return NextResponse.json({ error: "agentModels.antigravity must be an object" }, { status: 400 });
      }
      for (const grp of ["gemini", "other"] as const) {
        if (grp in agy) {
          const cfg = agy[grp];
          if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
            return NextResponse.json({ error: `agentModels.antigravity.${grp} must be an object` }, { status: 400 });
          }
          if (cfg.defaultModel !== undefined && typeof cfg.defaultModel !== "string") {
            return NextResponse.json({ error: `agentModels.antigravity.${grp}.defaultModel must be a string` }, { status: 400 });
          }
          if (cfg.availableModels !== undefined && (!Array.isArray(cfg.availableModels) || !cfg.availableModels.every((m: unknown) => typeof m === "string"))) {
            return NextResponse.json({ error: `agentModels.antigravity.${grp}.availableModels must be an array of strings` }, { status: 400 });
          }
        }
      }
    }
    for (const agent of ["claude", "codex"] as const) {
      if (agent in agentModels) {
        const cfg = agentModels[agent];
        if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
          return NextResponse.json({ error: `agentModels.${agent} must be an object` }, { status: 400 });
        }
        if (cfg.defaultModel !== undefined && typeof cfg.defaultModel !== "string") {
          return NextResponse.json({ error: `agentModels.${agent}.defaultModel must be a string` }, { status: 400 });
        }
        if (cfg.availableModels !== undefined && (!Array.isArray(cfg.availableModels) || !cfg.availableModels.every((m: unknown) => typeof m === "string"))) {
          return NextResponse.json({ error: `agentModels.${agent}.availableModels must be an array of strings` }, { status: 400 });
        }
      }
    }
  }

  const patch: {
    sessionArchiveDays?: number;
    showHiddenFiles?: boolean;
    showTempDirSessions?: boolean;
    enableAutomodel?: boolean;
    llmApiKeys?: Partial<Record<LlmApiKeyName, string | undefined>>;
    agentModels?: AgentModelsConfig;
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
  if (agentModels !== undefined) {
    const current = await getAgentModelsConfig();
    const agyInput = agentModels.antigravity;
    const next: AgentModelsConfig = {
      antigravity: {
        gemini: {
          defaultModel: agyInput?.gemini?.defaultModel !== undefined
            ? agyInput.gemini.defaultModel.trim()
            : current.antigravity.gemini.defaultModel,
          availableModels: Array.isArray(agyInput?.gemini?.availableModels)
            ? agyInput.gemini.availableModels.map((m: string) => m.trim()).filter(Boolean)
            : current.antigravity.gemini.availableModels,
        },
        other: {
          defaultModel: agyInput?.other?.defaultModel !== undefined
            ? agyInput.other.defaultModel.trim()
            : current.antigravity.other.defaultModel,
          availableModels: Array.isArray(agyInput?.other?.availableModels)
            ? agyInput.other.availableModels.map((m: string) => m.trim()).filter(Boolean)
            : current.antigravity.other.availableModels,
        },
      },
      claude: {
        defaultModel: agentModels.claude?.defaultModel !== undefined
          ? agentModels.claude.defaultModel.trim()
          : current.claude.defaultModel,
        availableModels: Array.isArray(agentModels.claude?.availableModels)
          ? agentModels.claude.availableModels.map((m: string) => m.trim()).filter(Boolean)
          : current.claude.availableModels,
      },
      codex: {
        defaultModel: agentModels.codex?.defaultModel !== undefined
          ? agentModels.codex.defaultModel.trim()
          : current.codex.defaultModel,
        availableModels: Array.isArray(agentModels.codex?.availableModels)
          ? agentModels.codex.availableModels.map((m: string) => m.trim()).filter(Boolean)
          : current.codex.availableModels,
      },
    };
    patch.agentModels = next;
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
  return NextResponse.json({
    ...updated,
    enableAutomodel: updated.enableAutomodel !== undefined ? updated.enableAutomodel : false,
    llmApiKeys: status,
    agentModels: updated.agentModels || (await getAgentModelsConfig()),
  });
}
