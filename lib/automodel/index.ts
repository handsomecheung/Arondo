import { generateObject, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getAutomodelConfig, isAutomodelEnabled } from "./config";
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

interface RouteModelOptions {
  writeLog?: (text: string) => void | Promise<void>;
}

function formatLogSection(title: string, value: unknown): string {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return [`## ${title}`, body, ""].join("\n");
}

export async function routeModel(input: AutoModelInput, options: RouteModelOptions = {}): Promise<AutoModelDecision | null> {
  const startedAt = Date.now();
  const logParts: string[] = [
    `# automodel ${new Date(startedAt).toISOString()}`,
    "",
    formatLogSection("Input", {
      agentType: input.agentType,
      defaultModel: input.defaultModel ?? null,
      modelOptions: input.modelOptions,
      message: input.message,
    }),
  ];
  const flushLog = async () => {
    if (!options.writeLog) return;
    logParts.push(formatLogSection("Elapsed", `${Date.now() - startedAt}ms`));
    await options.writeLog(logParts.join("\n"));
  };

  if (!isAutomodelEnabled()) {
    logParts.push(formatLogSection("Result", "skipped: automodel is disabled"));
    await flushLog();
    return null;
  }

  const config = getAutomodelConfig();
  if (!config) {
    logParts.push(formatLogSection("Result", "skipped: no automodel API key configured"));
    await flushLog();
    return null;
  }
  logParts.push(formatLogSection("Config", {
    provider: config.provider,
    model: config.model,
    timeoutMs: config.timeoutMs,
    apiKeyConfigured: true,
  }));

  const choices = input.modelOptions;
  if (choices.length === 0) {
    logParts.push(formatLogSection("Result", "skipped: no model options"));
    await flushLog();
    return null;
  }

  try {
    const model = createModel(config.provider, config.model, config.apiKey);
    const prompt = buildPrompt(input, choices);
    logParts.push(formatLogSection("Prompt", prompt));
    const result = await withTimeout(
      (abortSignal) => generateObject({
        model,
        schema: DecisionSchema,
        prompt,
        abortSignal,
      }),
      config.timeoutMs,
    );
    logParts.push(formatLogSection("Raw Decision", result.object));
    const selected = choices.find((choice) => choice.id === result.object.choiceId);
    if (!selected) {
      logParts.push(formatLogSection("Result", `skipped: invalid choiceId ${result.object.choiceId}`));
      await flushLog();
      return null;
    }
    const decision = normalizeDecision(selected, result.object);
    logParts.push(formatLogSection("Selected Choice", selected));
    logParts.push(formatLogSection("Result", decision));
    await flushLog();
    return decision;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[automodel] skipped: ${message}`);
    logParts.push(formatLogSection("Result", `skipped: ${message}`));
    await flushLog();
    return null;
  }
}

export type { AutoModelCostTier, AutoModelDecision, AutoModelEffort, AutoModelInput, AutoModelOption, AutoModelProvider } from "./types";
