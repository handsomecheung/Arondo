import type { AgentModelsConfig } from "@/lib/store";
export interface AdminSettingsData {
  sessionArchiveDays: number;
  automationSessionRetentionHours: number;
  showHiddenFiles?: boolean;
  enableAutomodel?: boolean;
  agentModels?: AgentModelsConfig;
  webPushContactEmail?: string;
  llmApiKeys?: Record<
    | "TYPESAFE_API_KEY"
    | "ANTHROPIC_API_KEY"
    | "OPENAI_API_KEY"
    | "GOOGLE_GENERATIVE_AI_API_KEY",
    { configured: boolean; source: "env" | "settings" | "none"; env: boolean }
  >;
}

export interface Runner {
  id: string;
  name: string;
  hostname: string;
  ip?: string;
  os: string;
  arch: string;
  connected: boolean;
  version?: string;
  capabilities?: string[];
  agents?: string[];
  lastSeenAt?: number;
  allowedUserTokenUuids?: string[];
  syncGlobalRules?: boolean;
}
export interface TokenInfo {
  token: string;
  uuid: string;
  name: string;
  type: "admin" | "user";
  color?: string;
}
