import fs from "fs";
import path from "path";
import { getConfigDir } from "../config";
import type { AutoModelProvider } from "./types";

export type LlmApiKeyName = "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY";

const CONFIG_FILE = path.join(getConfigDir(), "arondo.json");
const PROVIDER_PRIORITY: { provider: AutoModelProvider; keyName: LlmApiKeyName }[] = [
  { provider: "anthropic", keyName: "ANTHROPIC_API_KEY" },
  { provider: "openai", keyName: "OPENAI_API_KEY" },
  { provider: "google", keyName: "GOOGLE_GENERATIVE_AI_API_KEY" },
];
const TIMEOUT_MS = 2000;
const PROVIDER_MODELS: Record<AutoModelProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5.4-mini",
  google: "gemini-3.5-flash-lite",
};

export interface AutoModelConfig {
  provider: AutoModelProvider;
  model: string;
  timeoutMs: number;
  apiKey: string;
}

interface AutoModelSettingsFile {
  setitngs?: {
    enableAutomodel?: boolean;
    llmApiKeys?: Partial<Record<LlmApiKeyName, string>>;
  };
}

export function isAutomodelEnabled(): boolean {
  if (process.env.ARONDO_ENABLE_AUTOMODEL === "true") return true;
  if (process.env.ARONDO_ENABLE_AUTOMODEL === "false") return false;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AutoModelSettingsFile;
    return parsed.setitngs?.enableAutomodel === true;
  } catch {
    return false;
  }
}

export function getLlmApiKeyEnvStatus(): Record<LlmApiKeyName, boolean> {
  return {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY?.trim(),
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY?.trim(),
    GOOGLE_GENERATIVE_AI_API_KEY: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  };
}

function readStoredApiKeys(): Partial<Record<LlmApiKeyName, string>> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AutoModelSettingsFile;
    return parsed.setitngs?.llmApiKeys ?? {};
  } catch {
    return {};
  }
}

function readApiKey(keyName: LlmApiKeyName, stored: Partial<Record<LlmApiKeyName, string>>): string | undefined {
  const envValue = process.env[keyName]?.trim();
  if (envValue) return envValue;
  return stored[keyName]?.trim();
}

export function getAutomodelConfig(): AutoModelConfig | null {
  if (!isAutomodelEnabled()) {
    return null;
  }
  const stored = readStoredApiKeys();
  for (const { provider, keyName } of PROVIDER_PRIORITY) {
    const apiKey = readApiKey(keyName, stored);
    if (apiKey) {
      return {
        provider,
        model: PROVIDER_MODELS[provider],
        apiKey,
        timeoutMs: TIMEOUT_MS,
      };
    }
  }

  return null;
}
