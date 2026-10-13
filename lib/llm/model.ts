import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function createLlmModel(provider: string, model: string, apiKey: string): LanguageModel {
  if (provider === "openai") return createOpenAI({ apiKey })(model);
  if (provider === "google") return createGoogle({ apiKey })(model);
  return createAnthropic({ apiKey })(model);
}
