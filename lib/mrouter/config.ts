import fs from "fs";
import path from "path";
import { getConfigDir } from "../config";
import type { MRouterProvider } from "./types";

export type MRouterApiKeyName = "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY";

const CONFIG_FILE = path.join(getConfigDir(), "arondo.json");
const PROVIDER_PRIORITY: { provider: MRouterProvider; keyName: MRouterApiKeyName }[] = [
  { provider: "anthropic", keyName: "ANTHROPIC_API_KEY" },
  { provider: "openai", keyName: "OPENAI_API_KEY" },
  { provider: "google", keyName: "GOOGLE_GENERATIVE_AI_API_KEY" },
];
const TIMEOUT_MS = 2000;
const PROVIDER_MODELS: Record<MRouterProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5.4-mini",
  google: "gemini-3.5-flash-lite",
};

export interface MRouterConfig {
  provider: MRouterProvider;
  model: string;
  timeoutMs: number;
  apiKey: string;
}

interface MRouterSettingsFile {
  setitngs?: {
    mrouterApiKeys?: Partial<Record<MRouterApiKeyName, string>>;
  };
}

export function getMRouterApiKeyEnvStatus(): Record<MRouterApiKeyName, boolean> {
  return {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY?.trim(),
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY?.trim(),
    GOOGLE_GENERATIVE_AI_API_KEY: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  };
}

function readStoredApiKeys(): Partial<Record<MRouterApiKeyName, string>> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as MRouterSettingsFile;
    return parsed.setitngs?.mrouterApiKeys ?? {};
  } catch {
    return {};
  }
}

function readApiKey(keyName: MRouterApiKeyName, stored: Partial<Record<MRouterApiKeyName, string>>): string | undefined {
  const envValue = process.env[keyName]?.trim();
  if (envValue) return envValue;
  return stored[keyName]?.trim();
}

export function getMRouterConfig(): MRouterConfig | null {
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
