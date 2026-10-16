import { generateObject } from "ai";
import { z } from "zod";
import { isAutomodelEnabled, getAnyLlmConfig, getJevConfig, type JevConfig } from "../config";
import { getInnerAutomodelMethod } from "../../config";
import { createLlmModel } from "../model";
import type { AutoModelDecision, AutoModelInput, AutoModelOption } from "./types";

export * from "./types";

const DecisionSchema = z.object({
  choiceId: z.string(),
  taskClass: z.enum(["question", "small_change", "debug", "review", "large_change"]),
  costTier: z.enum(["cheap", "standard", "strong"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
});

const VALID_TASK_CLASSES = ["question", "small_change", "debug", "review", "large_change"] as const;
const VALID_COST_TIERS = ["cheap", "standard", "strong"] as const;

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

function normalizeDecision(
  selected: AutoModelOption,
  rawDecision: z.infer<typeof DecisionSchema>,
): AutoModelDecision {
  return {
    model: selected.model,
    effort: selected.effort,
    taskClass: rawDecision.taskClass,
    costTier: rawDecision.costTier,
    confidence: rawDecision.confidence,
    reason: rawDecision.reason,
  };
}

interface JevResponse {
  answers?: {
    choiceId?: {
      choice?: string;
      probabilities?: Record<string, number>;
    };
    taskClass?: {
      choice?: string;
    };
    costTier?: {
      choice?: string;
    };
  };
  error?: {
    message?: string;
  };
}

async function callJevRouting(
  input: AutoModelInput,
  choices: AutoModelOption[],
  jevConfig: JevConfig,
  logParts: string[],
): Promise<AutoModelDecision | null> {
  const criteria: Record<string, string> = {};
  for (const choice of choices) {
    const effortPart = choice.effort ? ` (${choice.effort} effort)` : "";
    const descPart = choice.description ? ` - ${choice.description}` : "";
    criteria[choice.id] = `[${choice.costTier} tier] ${choice.model}${effortPart}${descPart}`;
  }

  const state = [
    `Agent: ${input.agentType}`,
    `Default model: ${input.defaultModel ?? "(agent default)"}`,
    "",
    "User message:",
    input.message,
  ].join("\n");

  const payload = {
    model: jevConfig.model,
    state,
    questions: {
      choiceId: {
        type: "choice",
        instructions:
          "Choose the best model and effort option for the user coding task. Prefer cheaper/faster choices for questions, explanations, summaries, tiny edits; prefer stronger choices for complex code changes, debugging, reviews, migrations.",
        criteria,
      },
      taskClass: {
        type: "choice",
        instructions: "Classify the task category.",
        criteria: {
          question: "General question, explanation, summary, or query.",
          small_change: "Single-file or small code modification, trivial edit.",
          debug: "Investigating a bug, troubleshooting an error.",
          review: "Code review, inspection, analysis.",
          large_change: "Multi-file refactor, architecture change, new feature, complex task.",
        },
      },
      costTier: {
        type: "choice",
        instructions: "Determine the resource cost tier needed for this request.",
        criteria: {
          cheap: "Low compute / cheap model is sufficient.",
          standard: "Standard compute / balanced model.",
          strong: "High compute / strong reasoning model required.",
        },
      },
    },
  };

  logParts.push(formatLogSection("Jev Request", payload));

  const url =
    process.env.TYPESAFE_API_URL ||
    `${(process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai/v1").replace(/\/+$/, "")}/systemone`;

  const raw = await withTimeout(async (abortSignal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jevConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Jev API HTTP ${res.status}: ${errText}`);
    }
    return (await res.json()) as JevResponse;
  }, jevConfig.timeoutMs);

  logParts.push(formatLogSection("Jev Response", raw));

  const choiceId = raw.answers?.choiceId?.choice;
  if (!choiceId) {
    throw new Error("Jev did not return a choiceId answer");
  }

  const selected = choices.find((c) => c.id === choiceId);
  if (!selected) {
    throw new Error(`Jev returned unknown choiceId: ${choiceId}`);
  }

  const rawTaskClass = raw.answers?.taskClass?.choice;
  const taskClass = VALID_TASK_CLASSES.find((c) => c === rawTaskClass) ?? "small_change";

  const rawCostTier = raw.answers?.costTier?.choice;
  const costTier = VALID_COST_TIERS.find((t) => t === rawCostTier) ?? "standard";

  const probability = raw.answers?.choiceId?.probabilities?.[choiceId];
  const confidence =
    typeof probability === "number" && !Number.isNaN(probability)
      ? Math.max(0, Math.min(1, probability))
      : 0.9;

  return {
    model: selected.model,
    effort: selected.effort,
    taskClass,
    costTier,
    confidence,
    reason: `Selected by Jev System One (${jevConfig.model})`,
  };
}

function formatLogSection(title: string, value: unknown): string {
  if (typeof value === "string") {
    return `## ${title}\n${value}`;
  }
  return `## ${title}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export interface RouteModelOptions {
  writeLog?: (text: string) => void | Promise<void>;
}

export async function routeModel(
  input: AutoModelInput,
  options?: RouteModelOptions,
): Promise<AutoModelDecision | null> {
  const startedAt = Date.now();
  const logParts: string[] = [
    `# automodel ${new Date(startedAt).toISOString()}`,
    formatLogSection("Input", {
      agentType: input.agentType,
      defaultModel: input.defaultModel,
      message: input.message,
      modelOptions: input.modelOptions,
      once: input.once,
    }),
  ];

  const flushLog = async () => {
    if (!options?.writeLog) return;
    try {
      await options.writeLog(`${logParts.join("\n\n")}\n`);
    } catch (err) {
      console.warn("[automodel] failed to write automodel log:", err);
    }
  };

  if (!isAutomodelEnabled()) {
    logParts.push(formatLogSection("Result", "skipped: automodel is disabled"));
    await flushLog();
    return null;
  }

  // Automodel only applies to single-use (--once) sessions to avoid frequent model switching in resume sessions
  if (input.once === false) {
    logParts.push(formatLogSection("Result", "skipped: automodel only applies to once sessions"));
    await flushLog();
    return null;
  }

  const choices = input.modelOptions;
  if (choices.length === 0) {
    logParts.push(formatLogSection("Result", "skipped: no model options"));
    await flushLog();
    return null;
  }

  const method = getInnerAutomodelMethod();
  logParts.push(formatLogSection("Method", method));

  // 1. Try Jev (TypeSafe AI System One) first if method is DM and configured
  if (method === "DM") {
    const jevConfig = getJevConfig(1500);
    if (jevConfig) {
      logParts.push(formatLogSection("Config (Jev)", {
        provider: "typesafe",
        model: jevConfig.model,
        timeoutMs: jevConfig.timeoutMs,
        apiKeyConfigured: true,
      }));
      try {
        const jevDecision = await callJevRouting(input, choices, jevConfig, logParts);
        if (jevDecision) {
          const selected = choices.find((c) => c.model === jevDecision.model && c.effort === jevDecision.effort);
          if (selected) {
            logParts.push(formatLogSection("Selected Choice", selected));
          }
          logParts.push(formatLogSection("Result", jevDecision));
          await flushLog();
          console.log(`[automodel] (${input.agentType}) routed to ${jevDecision.model}${jevDecision.effort ? ` (${jevDecision.effort})` : ""} via Jev (${jevConfig.model})`);
          return jevDecision;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[automodel] Jev routing failed, falling back to standard LLM: ${message}`);
        logParts.push(formatLogSection("Jev Fallback", `failed: ${message}, falling back to standard LLM`));
      }
    }
  }

  // 2. Fall back to standard LLM (Anthropic -> OpenAI -> Google)
  const config = getAnyLlmConfig(2000);
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

  try {
    const model = createLlmModel(config.provider, config.model, config.apiKey);
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
    console.log(`[automodel] (${input.agentType}) routed to ${decision.model}${decision.effort ? ` (${decision.effort})` : ""} via ${config.provider}`);
    return decision;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[automodel] skipped: ${message}`);
    logParts.push(formatLogSection("Result", `skipped: ${message}`));
    await flushLog();
    return null;
  }
}
