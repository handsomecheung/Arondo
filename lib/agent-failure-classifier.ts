import { getJevConfig } from "./llm/config";

export type AgentFailureKind =
  | "invalid_model"
  | "quota_exhausted"
  | "agent_error"
  | "arondo_parameter_error"
  | "unknown";

export interface AgentFailureClassificationInput {
  agentType: string | undefined;
  exitCode: number;
  command: string;
  stdout: string;
  stderr: string;
}

export type AgentFailureClassificationResult =
  | { status: "classified"; kind: AgentFailureKind; confidence?: number }
  | { status: "unavailable"; reason: "not_configured" | "request_failed" };

const FAILURE_KINDS: AgentFailureKind[] = [
  "invalid_model",
  "quota_exhausted",
  "agent_error",
  "arondo_parameter_error",
  "unknown",
];

interface JevResponse {
  answers?: Record<string, { choice?: string; confidence?: number }>;
}

function getJevUrl(): string {
  return process.env.TYPESAFE_API_URL ||
    `${(process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai/v1").replace(/\/+$/, "")}/systemone`;
}

export async function classifyAgentFailure(
  input: AgentFailureClassificationInput,
): Promise<AgentFailureClassificationResult> {
  const config = getJevConfig(5_000);
  if (!config) return { status: "unavailable", reason: "not_configured" };

  const state = JSON.stringify({
    agentType: input.agentType || "unknown",
    exitCode: input.exitCode,
    command: input.command,
    stdout: input.stdout.slice(-12_000),
    stderr: input.stderr.slice(-12_000),
  });
  const payload = {
    model: config.model,
    state,
    questions: {
      failure_kind: {
        type: "choice",
        instructions: "Classify the cause of this AI coding-agent execution failure using only the supplied execution evidence. Select exactly one category. Do not infer quota exhaustion without concrete evidence.",
        criteria: {
          invalid_model: "The selected model is unavailable, invalid, deprecated, or rejected by the agent CLI.",
          quota_exhausted: "The agent account, subscription, rate, usage, or quota limit prevented execution.",
          agent_error: "The agent CLI, its service, authentication, network, or its own runtime failed; retrying later may help.",
          arondo_parameter_error: "Arondo passed an invalid command, argument, work directory, model option, or other invocation parameter.",
          unknown: "The evidence does not reliably support any other category.",
        },
      },
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const response = await fetch(getJevUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) throw new Error(`Jev API HTTP ${response.status}`);

    const raw = await response.json() as JevResponse;
    const answer = raw.answers?.failure_kind;
    if (!answer || !FAILURE_KINDS.includes(answer.choice as AgentFailureKind)) {
      throw new Error("Jev did not return a valid failure classification");
    }
    return {
      status: "classified",
      kind: answer.choice as AgentFailureKind,
      confidence: answer.confidence,
    };
  } catch (err) {
    console.error("[agent-failure-classifier] Jev classification failed:", err);
    return { status: "unavailable", reason: "request_failed" };
  }
}
