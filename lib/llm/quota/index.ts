import { generateObject } from "ai";
import { z } from "zod";
import { getAnyLlmConfig } from "../config";
import { createLlmModel } from "../model";

const AgyQuotaDetailsSchema = z.object({
  account: z.string().describe("User account email or username"),
  plan: z.string().describe("User subscription plan (e.g. Google AI Pro)"),
  defaultModel: z.string().describe("Default or active model"),
  geminiWeeklyRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for GEMINI MODELS Weekly Limit Remaining (e.g. 20.81% -> 0.2081)"),
  geminiWeeklyResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for GEMINI MODELS weekly reset, or null"),
  geminiHourRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for GEMINI MODELS Five Hour Limit Remaining (e.g. 60.97% -> 0.6097)"),
  geminiHourResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for GEMINI MODELS five hour reset, or null"),
  otherWeeklyRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for CLAUDE AND GPT MODELS Weekly Limit Remaining (e.g. 74.34% -> 0.7434)"),
  otherWeeklyResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for CLAUDE AND GPT MODELS weekly reset, or null"),
  otherHourRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for CLAUDE AND GPT MODELS Five Hour Limit Remaining (e.g. 100% or Quota available -> 1.0)"),
  otherHourResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for CLAUDE AND GPT MODELS five hour reset, or null"),
  argonWeeklyRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for GEMINI 4 ARGON Weekly Limit Remaining (e.g. 100% or Quota available -> 1.0)"),
  argonWeeklyResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for GEMINI 4 ARGON weekly reset, or null"),
});

const ClaudeQuotaDetailsSchema = z.object({
  account: z.string().describe("User account email or username"),
  plan: z.string().describe("User subscription plan (e.g. Claude Pro account, Team)"),
  defaultModel: z.string().describe("Default or active model"),
  isApiKey: z.boolean().describe("true if using API key billing instead of subscription"),
  hourRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for session limit remaining (note: if screen shows 'X% used', remaining is 1.0 - X/100)"),
  hourResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for session reset, or null"),
  weekRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for weekly limit remaining (note: if screen shows 'X% used', remaining is 1.0 - X/100)"),
  weekResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for weekly reset, or null"),
});

const CodexQuotaDetailsSchema = z.object({
  account: z.string().describe("User account email, username, or UUID"),
  plan: z.string().describe("User subscription plan (e.g. Plus, Pro, Team)"),
  defaultModel: z.string().describe("Default or active model"),
  fiveHourRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for 5h limit remaining (e.g. 91% left -> 0.91)"),
  fiveHourResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for 5h limit reset, or null"),
  weeklyRemain: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Float 0.0-1.0 for weekly limit remaining (e.g. 60% left -> 0.6)"),
  weeklyResetsAt: z
    .number()
    .nullable()
    .describe("Unix timestamp in seconds for weekly limit reset, or null"),
});

export interface QuotaDecision {
  status: "need_action" | "quota_extracted" | "failed";
  keysToSend?: string;
  delayMs?: number;
  quota?: {
    account?: string;
    plan?: string;
    defaultModel?: string;
    isApiKey?: boolean;
    geminiWeeklyRemain?: number | null;
    geminiWeeklyResetsAt?: number | null;
    geminiHourRemain?: number | null;
    geminiHourResetsAt?: number | null;
    otherWeeklyRemain?: number | null;
    otherWeeklyResetsAt?: number | null;
    otherHourRemain?: number | null;
    otherHourResetsAt?: number | null;
    argonWeeklyRemain?: number | null;
    argonWeeklyResetsAt?: number | null;
    hourRemain?: number | null;
    hourResetsAt?: number | null;
    weekRemain?: number | null;
    weekResetsAt?: number | null;
    fiveHourRemain?: number | null;
    fiveHourResetsAt?: number | null;
    weeklyRemain?: number | null;
    weeklyResetsAt?: number | null;
  };
  reason: string;
}

export interface QuotaStepInput {
  agent: string; // "claude" | "agy" | "codex"
  step: number;
  paneText: string;
}

export async function decideQuotaStep(input: QuotaStepInput): Promise<QuotaDecision | null> {
  const cfg = getAnyLlmConfig();
  if (!cfg) {
    return null;
  }

  const model = createLlmModel(cfg.provider, cfg.model, cfg.apiKey);
  const nowUnix = Math.floor(Date.now() / 1000);

  let schema: any;
  let agentInstructions = "";

  if (input.agent === "agy") {
    schema = z.object({
      status: z.enum(["need_action", "quota_extracted", "failed"]),
      keysToSend: z.string().optional().describe("Key sequence to send, e.g. '/usage\\n' or 'Enter'"),
      delayMs: z.number().optional(),
      quota: AgyQuotaDetailsSchema.optional(),
      reason: z.string().max(300),
    });
    agentInstructions = [
      "- If usage/quota is not yet shown, send '/usage\\n' on step 1. Do NOT set status='quota_extracted' on step 1 before /usage has been run!",
      "- Set status='quota_extracted' ONLY when the 'Models & Quota' panel with 'GEMINI MODELS', 'CLAUDE AND GPT MODELS', or 'GEMINI 4 ARGON' is visible.",
      "- In quota:",
      "  * geminiWeeklyRemain: 'Weekly Limit Remaining' under 'GEMINI MODELS' as float 0.0-1.0.",
      "  * geminiHourRemain: 'Five Hour Limit Remaining' under 'GEMINI MODELS' as float 0.0-1.0.",
      "  * otherWeeklyRemain: 'Weekly Limit Remaining' under 'CLAUDE AND GPT MODELS' as float 0.0-1.0.",
      "  * otherHourRemain: 'Five Hour Limit Remaining' under 'CLAUDE AND GPT MODELS' as float 0.0-1.0. If shows 'Quota available' or 100%, use 1.0.",
      "  * argonWeeklyRemain: 'Gemini 4 Argon Weekly Limit' under 'GEMINI 4 ARGON' as float 0.0-1.0. If shows 'Quota available' or 100%, use 1.0. Note that Argon has no five-hour limit.",
      "  * resets timestamps: unix timestamp in seconds computed from 'Refreshes in Xh Ym' + current unix timestamp, or null.",
    ].join("\n");
  } else if (input.agent === "claude") {
    schema = z.object({
      status: z.enum(["need_action", "quota_extracted", "failed"]),
      keysToSend: z.string().optional().describe("Key sequence to send, e.g. '/status\\n' or '/usage\\n'"),
      delayMs: z.number().optional(),
      quota: ClaudeQuotaDetailsSchema.optional(),
      reason: z.string().max(300),
    });
    agentInstructions = [
      "- If usage/quota is not yet shown, send '/status\\n' or '/usage\\n'.",
      "- Note: If screen shows 'X% used', the remaining fraction is (1.0 - X/100). E.g. '2% used' -> 0.98, '43% used' -> 0.57.",
      "- resets timestamps: unix timestamp in seconds computed from reset date/time, or null.",
    ].join("\n");
  } else {
    schema = z.object({
      status: z.enum(["need_action", "quota_extracted", "failed"]),
      keysToSend: z.string().optional().describe("Key sequence to send, e.g. '/status\\n'"),
      delayMs: z.number().optional(),
      quota: CodexQuotaDetailsSchema.optional(),
      reason: z.string().max(300),
    });
    agentInstructions = [
      "- If status/quota is not yet shown, send '/status\\n'.",
      "- In quota: 5h limit -> fiveHourRemain (0.0 to 1.0), Weekly limit -> weeklyRemain (0.0 to 1.0).",
      "- resets timestamps: unix timestamp in seconds computed from reset date/time, or null.",
    ].join("\n");
  }

  const prompt = [
    "You are an automated CLI interaction agent for Arondo.",
    `Your goal is to inspect the captured terminal screen of the AI agent CLI "${input.agent}" and extract its account/quota status.`,
    `Current interaction step: ${input.step} (max 5 steps).`,
    "",
    "Rules for decision:",
    "1. If the current screen has a welcome prompt, disclaimer, workspace trust dialog, release notes, or modal dialog (e.g. 'Press enter to continue', 'I trust this folder', etc.), choose status='need_action' and keysToSend (e.g. '\\n' for Enter, '1\\n' to choose trust, or 'Escape').",
    "2. If the terminal is at the main input prompt or idle prompt and quota/usage has NOT been displayed yet:",
    "   - You MUST send the slash command to open the quota/status view first before extracting quota!",
    agentInstructions,
    "3. Set status='quota_extracted' ONLY when the quota/usage percentages or limits are actually visible on screen.",
    "4. If we are stuck or it is impossible to proceed after trying, return status='failed' with a concise reason.",
    "5. For keysToSend: use '\\n' for Enter, 'Escape' for Escape, 'Down' for arrow down.",
    "",
    "--- Current Server Time (Unix Timestamp) ---",
    `Current time: ${nowUnix}`,
    "",
    "--- Captured Terminal Screen ---",
    input.paneText.slice(-4000),
  ].join("\n");

  try {
    const result = await generateObject({
      model,
      schema,
      prompt,
    });
    console.log(`[llm/quota] decideQuotaStep (${input.agent} step ${input.step}):`, JSON.stringify(result.object));
    return result.object as QuotaDecision;
  } catch (err) {
    console.warn(`[llm/quota] decideQuotaStep error:`, err);
    return null;
  }
}
