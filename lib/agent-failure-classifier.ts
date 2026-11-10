import { getJevConfig } from "./llm/config";

export type AgentFailureKind =
  | "completed_with_warnings"
  | "invalid_model"
  | "quota_exhausted"
  | "agent_error"
  | "arondo_parameter_error"
  | "unknown";

export interface AgentFailureClassificationInput {
  agentType: string | undefined;
  exitCode: number;
  exitCodeSynthetic?: boolean;
  logsMayBeIncomplete?: boolean;
  command: string;
  userPrompt?: string;
  stdout: string;
  stderr: string;
}

export type FailureEvidenceSource = "stdout" | "stderr";

export type AgentFailureClassificationResult =
  | { status: "classified"; kind: AgentFailureKind; confidence?: number }
  | { status: "unavailable"; reason: "not_configured" | "request_failed" };

const FAILURE_KINDS: AgentFailureKind[] = [
  "completed_with_warnings",
  "invalid_model",
  "quota_exhausted",
  "agent_error",
  "arondo_parameter_error",
  "unknown",
];

export function truncateLog(
  text: string,
  headChars: number,
  tailChars: number,
): { text: string; truncated: boolean; omittedChars: number } {
  if (!text || text.length <= headChars + tailChars) {
    return { text: text || "", truncated: false, omittedChars: 0 };
  }
  const omittedChars = text.length - (headChars + tailChars);
  const truncatedText = `${text.slice(0, headChars)}\n\n[... middle omitted: ${omittedChars} characters truncated due to length limits. Head and tail preserved ...]\n\n${text.slice(-tailChars)}`;
  return { text: truncatedText, truncated: true, omittedChars };
}

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

  const evidenceSource: FailureEvidenceSource = input.stdout.trim() ? "stdout" : "stderr";
  const evidence = evidenceSource === "stdout"
    ? truncateLog(input.stdout, 2_000, 10_000)
    : truncateLog(input.stderr, 1_000, 9_000);
  const truncatedPrompt = input.userPrompt ? truncateLog(input.userPrompt, 1_000, 2_000) : undefined;

  const state = JSON.stringify({
    agentType: input.agentType || "unknown",
    exitCode: input.exitCode,
    exitCodeSynthetic: !!input.exitCodeSynthetic,
    logsMayBeIncomplete: !!input.logsMayBeIncomplete,
    command: input.command,
    userPrompt: truncatedPrompt?.text,
    userPromptTruncated: truncatedPrompt?.truncated || undefined,
    evidenceSource,
    evidence: evidence.text,
    evidenceTruncated: evidence.truncated,
    evidenceOmittedChars: evidence.truncated ? evidence.omittedChars : undefined,
  });
  const payload = {
    model: config.model,
    state,
    questions: {
      failure_kind: {
        type: "choice",
        instructions: "Classify the cause and outcome of this AI coding-agent execution failure or non-zero exit code using the supplied evidence. evidenceSource states which stream the evidence comes from. If it is stdout, the agent produced output and stderr is intentionally not supplied; judge by whether stdout is a complete answer, and do not assume errors that are absent from the evidence. If it is stderr, stdout was empty and stderr is the only evidence. exitCodeSynthetic true means exitCode is not a real process exit code: Arondo assigned it because the runner lost track of the process, so it is not evidence of an agent failure. logsMayBeIncomplete true means output may have been lost while the runner was disconnected, so a missing or truncated answer may be caused by that rather than by the agent. Select exactly one category. If the evidence is marked as truncated, the middle content was omitted due to length limits; evaluate completeness using the preserved start and finish. Do not infer quota exhaustion without concrete evidence.",
        criteria: {
          completed_with_warnings: "The agent exited with a non-zero exit code, but the evidence is stdout and contains a complete, substantive final answer to userPrompt. Only applicable when evidenceSource is stdout.",
          invalid_model: "The selected model is unavailable, invalid, deprecated, or rejected by the agent CLI.",
          quota_exhausted: "The agent account, subscription, rate, usage, or quota limit prevented execution.",
          agent_error: "The agent CLI, its service, authentication, network, or its own runtime failed without producing a complete answer; retrying later may help. With evidenceSource stdout and logsMayBeIncomplete false, a missing or incomplete final answer indicates this.",
          arondo_parameter_error: "Arondo passed an invalid command, argument, work directory, model option, or other invocation parameter.",
          unknown: "The evidence does not reliably support any other category, including when logsMayBeIncomplete is true and an incomplete answer cannot be attributed to the agent.",
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
