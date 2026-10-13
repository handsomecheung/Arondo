import fs from "fs";
import path from "path";
import { getConfigDir } from "../config";

export type LlmProvider = "anthropic" | "openai" | "google";
export type LlmApiKeyName = "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY";

const CONFIG_FILE = path.join(getConfigDir(), "arondo.json");

export const PROVIDER_PRIORITY: { provider: LlmProvider; keyName: LlmApiKeyName }[] = [
  { provider: "anthropic", keyName: "ANTHROPIC_API_KEY" },
  { provider: "openai", keyName: "OPENAI_API_KEY" },
  { provider: "google", keyName: "GOOGLE_GENERATIVE_AI_API_KEY" },
];

export const PROVIDER_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5.4-mini",
  google: "gemini-3.5-flash-lite",
};

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  timeoutMs: number;
  apiKey: string;
}

interface LlmSettingsFile {
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
    const parsed = JSON.parse(raw) as LlmSettingsFile;
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
    const parsed = JSON.parse(raw) as LlmSettingsFile;
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

export function getAnyLlmConfig(timeoutMs = 15_000): LlmConfig | null {
  const stored = readStoredApiKeys();
  for (const { provider, keyName } of PROVIDER_PRIORITY) {
    const apiKey = readApiKey(keyName, stored);
    if (apiKey) {
      return {
        provider,
        model: PROVIDER_MODELS[provider],
        apiKey,
        timeoutMs,
      };
    }
  }

  return null;
}

export function getAutomodelConfig(): LlmConfig | null {
  if (!isAutomodelEnabled()) {
    return null;
  }
  return getAnyLlmConfig(2000);
}
