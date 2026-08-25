import { generateObject, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getAutomodelConfig } from "./config";
import type { AutoModelDecision, AutoModelInput, AutoModelOption } from "./types";

const DecisionSchema = z.object({
  choiceId: z.string(),
  taskClass: z.enum(["question", "small_change", "debug", "review", "large_change"]),
  costTier: z.enum(["cheap", "standard", "strong"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
});

function createModel(provider: string, model: string, apiKey: string): LanguageModel {
  if (provider === "openai") return createOpenAI({ apiKey })(model);
  if (provider === "google") return createGoogle({ apiKey })(model);
  return createAnthropic({ apiKey })(model);
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("automodel timed out"));
    }, timeoutMs);
    run(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function buildPrompt(input: AutoModelInput, choices: AutoModelOption[]): string {
  return [
    "You are Arondo automodel, a model and effort router for coding agents.",
    "The agent has already been selected. Choose only the best model/effort choice for that agent.",
    "Prefer cheaper choices for questions, explanations, summaries, tiny edits, and low-risk follow-ups.",
    "Prefer stronger choices for broad code changes, debugging, reviews, migrations, or ambiguous high-risk work.",
    "Return one of the provided choice ids only.",
    "",
    `Agent: ${input.agentType}`,
    `Current default model: ${input.defaultModel ?? "(agent default)"}`,
    "",
    "Choices:",
    JSON.stringify(choices, null, 2),
    "",
    "User message:",
    input.message,
  ].join("\n");
}

function normalizeDecision(choice: AutoModelOption, object: z.infer<typeof DecisionSchema>): AutoModelDecision {
  return {
    model: choice.model,
    effort: choice.effort,
    taskClass: object.taskClass,
    costTier: object.costTier,
    confidence: object.confidence,
    reason: object.reason,
  };
}

export async function routeModel(input: AutoModelInput): Promise<AutoModelDecision | null> {
  const config = getAutomodelConfig();
  if (!config) return null;

  const choices = input.modelOptions;
  if (choices.length === 0) return null;

  try {
    const model = createModel(config.provider, config.model, config.apiKey);
    const result = await withTimeout(
      (abortSignal) => generateObject({
        model,
        schema: DecisionSchema,
        prompt: buildPrompt(input, choices),
        abortSignal,
      }),
      config.timeoutMs,
    );
    const selected = choices.find((choice) => choice.id === result.object.choiceId);
    if (!selected) return null;
    return normalizeDecision(selected, result.object);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[automodel] skipped: ${message}`);
    return null;
  }
}

export type { AutoModelDecision, AutoModelEffort, AutoModelInput, AutoModelOption, AutoModelProvider } from "./types";
