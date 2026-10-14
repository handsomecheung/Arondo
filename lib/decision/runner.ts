import { getJevConfig } from "../llm/config";
import {
  type Session,
  addMessage,
  appendSessionLog,
  clearSessionLog,
  updateSession,
} from "../store";
import { eventBus } from "../event-bus";
import { runnerManager } from "../runner-manager";

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  choices?: string[];
  criteria?: Record<string, string>;
}

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria?: string[];
  levels?: string[];
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export interface JevPayloadInput {
  state?: unknown;
  model?: string;
  questions: Record<string, JevQuestion>;
}

export const DECISION_SCHEMA_HELP = `Decision Mode requires valid JSON conforming to the Jev System One question schema.
(The 'model' field is optional and defaults to 'jev-latest'. The 'state' field is optional.)

Official TypeSafe Jev Example:
{
  "state": "Our API integration started returning 500 errors on every request about 20 minutes ago, and we can't process any customer orders until this is fixed.",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this",
      "criteria": {
        "billing": "Payment or subscription issues",
        "technical": "Bugs or integration problems",
        "sales": "Pricing or account questions"
      }
    },
    "frustration": {
      "type": "score",
      "instructions": "How frustrated the customer appears",
      "criteria": [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}

Individual question type formats:

1. 'choice' (Categorical selection among options):
{
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this",
      "criteria": {
        "billing": "Payment or subscription issues",
        "technical": "Bugs or integration problems",
        "sales": "Pricing or account questions"
      }
    }
  }
}

2. 'score' (Ordered scale between 2 and 10 levels):
{
  "questions": {
    "frustration": {
      "type": "score",
      "instructions": "How frustrated the customer appears",
      "criteria": [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language"
      ]
    }
  }
}

3. 'noul' (Yes/No proposition probability):
{
  "questions": {
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}`;

function cleanJsonInput(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function validateAndParseJevInput(
  rawInput: string,
): { ok: true; payload: JevPayloadInput } | { ok: false; error: string } {
  let parsed: any;
  try {
    const cleaned = cleanJsonInput(rawInput);
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON format: ${err instanceof Error ? err.message : String(err)}\n\n${DECISION_SCHEMA_HELP}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: `JSON payload must be an object containing a 'questions' map.\n\n${DECISION_SCHEMA_HELP}`,
    };
  }

  let questions = parsed.questions;
  const state = parsed.state;
  const model = parsed.model;

  if (!questions && typeof parsed === "object") {
    const keys = Object.keys(parsed);
    const looksLikeQuestionsMap =
      keys.length > 0 &&
      keys.every((k) => {
        const v = parsed[k];
        return (
          v &&
          typeof v === "object" &&
          (v.type === "choice" || v.type === "noul" || v.type === "score")
        );
      });
    if (looksLikeQuestionsMap) {
      questions = parsed;
    }
  }

  if (
    !questions ||
    typeof questions !== "object" ||
    Array.isArray(questions) ||
    Object.keys(questions).length === 0
  ) {
    return {
      ok: false,
      error: `Missing or empty 'questions' field in JSON payload.\n\n${DECISION_SCHEMA_HELP}`,
    };
  }

  for (const [key, q] of Object.entries<any>(questions)) {
    if (!q || typeof q !== "object") {
      return {
        ok: false,
        error: `Question '${key}' must be an object.\n\n${DECISION_SCHEMA_HELP}`,
      };
    }
    if (!["choice", "noul", "score"].includes(q.type)) {
      return {
        ok: false,
        error: `Question '${key}' has invalid type '${q.type}'. Supported types: 'choice', 'noul', 'score'.\n\n${DECISION_SCHEMA_HELP}`,
      };
    }
    if (!q.instructions || typeof q.instructions !== "string") {
      return {
        ok: false,
        error: `Question '${key}' must include a string 'instructions' field.\n\n${DECISION_SCHEMA_HELP}`,
      };
    }
    if (q.type === "choice") {
      const hasChoices = Array.isArray(q.choices) && q.choices.length > 0;
      const hasCriteria =
        q.criteria &&
        typeof q.criteria === "object" &&
        !Array.isArray(q.criteria) &&
        Object.keys(q.criteria).length > 0;
      if (!hasChoices && !hasCriteria) {
        return {
          ok: false,
          error: `Question '${key}' of type 'choice' must have 'choices' (string array) or 'criteria' (object mapping choice ID to description).\n\n${DECISION_SCHEMA_HELP}`,
        };
      }
    }
    if (q.type === "score") {
      const levels = Array.isArray(q.criteria)
        ? q.criteria
        : Array.isArray(q.levels)
        ? q.levels
        : null;
      if (!levels || levels.length < 2 || levels.length > 10) {
        return {
          ok: false,
          error: `Question '${key}' of type 'score' must specify 2 to 10 levels in 'criteria' or 'levels' array.\n\n${DECISION_SCHEMA_HELP}`,
        };
      }
    }
  }

  return {
    ok: true,
    payload: {
      state,
      model,
      questions,
    },
  };
}

interface JevRawAnswer {
  choice?: string;
  noul?: number;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface JevResponse {
  answers?: Record<string, JevRawAnswer>;
  error?: {
    message?: string;
  };
}

function formatDecisionResults(params: {
  questions: Record<string, JevQuestion>;
  answers: Record<string, JevRawAnswer>;
  model: string;
  durationMs: number;
}): { markdown: string; plainText: string; summary: string } {
  const mdSections: string[] = ["### 🎯 Decision Results", ""];
  const cliSections: string[] = ["", "=== 🎯 Decision Results ==="];
  const summaryParts: string[] = [];

  for (const [key, q] of Object.entries(params.questions)) {
    const ans = params.answers[key] || {};

    if (q.type === "noul") {
      const prob = typeof ans.noul === "number" ? ans.noul : 0;
      const isTrue = prob >= 0.5;
      const verdict = isTrue ? "True / Yes" : "False / No";
      const pct = (prob * 100).toFixed(1);

      summaryParts.push(`${key}: ${verdict} (${pct}%)`);

      mdSections.push(`#### ⚖️ \`${key}\` (\`noul\`)`);
      mdSections.push(`> **Instructions**: ${q.instructions}`);
      mdSections.push(`- **Result**: **${verdict}** (Truth probability: **${pct}%**)`);
      mdSections.push("");

      cliSections.push(`[noul] ${key}:`);
      cliSections.push(`  Instructions: ${q.instructions}`);
      cliSections.push(`  Result:       ${verdict} (${pct}% probability)`);
      cliSections.push("");
    } else if (q.type === "score") {
      const scoreVal = typeof ans.score === "number" ? ans.score.toFixed(2) : "N/A";
      const conf = typeof ans.confidence === "number" ? `${(ans.confidence * 100).toFixed(1)}%` : "N/A";

      summaryParts.push(`${key}: Score ${scoreVal} (${conf})`);

      mdSections.push(`#### 📊 \`${key}\` (\`score\`)`);
      mdSections.push(`> **Instructions**: ${q.instructions}`);
      mdSections.push(`- **Score**: **\`${scoreVal}\`** (Confidence: ${conf})`);
      mdSections.push("");

      cliSections.push(`[score] ${key}:`);
      cliSections.push(`  Instructions: ${q.instructions}`);
      cliSections.push(`  Score:        ${scoreVal} (${conf} confidence)`);

      if (ans.probabilities && Object.keys(ans.probabilities).length > 0) {
        mdSections.push("| Level | Probability |");
        mdSections.push("| :--- | :--- |");
        cliSections.push("  Probabilities:");
        for (const [lvl, p] of Object.entries(ans.probabilities)) {
          const pPct = (p * 100).toFixed(1);
          mdSections.push(`| ${lvl} | ${pPct}% |`);
          cliSections.push(`    - ${lvl.padEnd(16)}: ${pPct.padStart(5)}%`);
        }
        mdSections.push("");
        cliSections.push("");
      }
    } else {
      // choice
      const selected = ans.choice || "Unknown";
      const conf = typeof ans.confidence === "number" ? `${(ans.confidence * 100).toFixed(1)}%` : "N/A";

      summaryParts.push(`${key}: ${selected} (${conf})`);

      mdSections.push(`#### 🎯 \`${key}\` (\`choice\`)`);
      mdSections.push(`> **Instructions**: ${q.instructions}`);
      mdSections.push(`- **Selected**: **\`${selected}\`** (Confidence: ${conf})`);
      mdSections.push("");

      cliSections.push(`[choice] ${key}:`);
      cliSections.push(`  Instructions: ${q.instructions}`);
      cliSections.push(`  Selected:     ${selected} (${conf} confidence)`);

      if (ans.probabilities && Object.keys(ans.probabilities).length > 0) {
        mdSections.push("| Option | Probability |");
        mdSections.push("| :--- | :--- |");
        cliSections.push("  Probabilities:");
        for (const [opt, p] of Object.entries(ans.probabilities)) {
          const isSelected = opt === selected;
          const pPct = (p * 100).toFixed(1);
          const badge = isSelected ? " ✅ **(Selected)**" : "";
          const name = isSelected ? `**${opt}**` : opt;
          mdSections.push(`| ${name}${badge} | ${pPct}% |`);
          cliSections.push(`    - ${opt.padEnd(16)}: ${pPct.padStart(5)}%${isSelected ? " [SELECTED] ✅" : ""}`);
        }
        mdSections.push("");
        cliSections.push("");
      }
    }
  }

  mdSections.push("---");
  mdSections.push(`- **Model**: Jev System One (\`${params.model}\`)`);
  mdSections.push(`- **Latency**: ${params.durationMs}ms`);

  cliSections.push(`Evaluated by Jev System One (${params.model}) in ${params.durationMs}ms`);
  cliSections.push("===========================");
  cliSections.push("");

  return {
    markdown: mdSections.join("\n"),
    plainText: cliSections.join("\n"),
    summary: summaryParts.join(", "),
  };
}

export async function executeDecisionSession(
  session: Session,
  systemMessageId: string,
  prompt: string,
): Promise<void> {
  const startedAt = Date.now();
  await clearSessionLog(session.id, systemMessageId, "agent");

  const jevConfig = getJevConfig(10_000);
  if (!jevConfig) {
    const errorMsg = "TYPESAFE_API_KEY is not configured. Please configure it in Admin Settings.";
    await appendSessionLog(session.id, systemMessageId, "agent", `❌ ${errorMsg}\n`, true);
    eventBus.publish({
      type: "terminal_output",
      payload: {
        sessionId: session.id,
        messageId: systemMessageId,
        data: `\r\n❌ ${errorMsg}\r\n`,
      },
    });
    const updated = await updateSession(session.id, {
      status: "error",
      errorMessage: errorMsg,
      completedAt: new Date().toISOString(),
    });
    const returnMsg = await addMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: `❌ ${errorMsg}`,
      type: "agent-return",
      parentId: systemMessageId,
      tokenUuid: session.tokenUuid,
    });
    eventBus.publish({ type: "session_updated", payload: updated });
    eventBus.publish({ type: "message_added", payload: returnMsg });
    return;
  }

  const validation = validateAndParseJevInput(prompt);
  if (!validation.ok) {
    const errorMsg = validation.error;
    await appendSessionLog(session.id, systemMessageId, "agent", `❌ ${errorMsg}\n`, true);
    eventBus.publish({
      type: "terminal_output",
      payload: {
        sessionId: session.id,
        messageId: systemMessageId,
        data: `\r\n❌ ${errorMsg}\r\n`,
      },
    });
    const updated = await updateSession(session.id, {
      status: "error",
      errorMessage: "Invalid Decision Mode input: JSON format required",
      completedAt: new Date().toISOString(),
    });
    const returnMsg = await addMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: `❌ Invalid Decision Mode input: JSON format conforming to Jev System One question schema is required.`,
      type: "agent-return",
      parentId: systemMessageId,
      tokenUuid: session.tokenUuid,
    });
    eventBus.publish({ type: "session_updated", payload: updated });
    eventBus.publish({ type: "message_added", payload: returnMsg });
    return;
  }

  let gitDiff: string | undefined;
  if (session.runnerId && session.repoPath && !session.noProject) {
    try {
      const res = await runnerManager.sendRequest(
        session.runnerId,
        "git.diff",
        { workDir: session.repoPath },
        3000,
      );
      if (res?.diff && res.diff.trim()) {
        gitDiff = res.diff.length > 5000 ? `${res.diff.slice(0, 5000)}\n... (truncated)` : res.diff;
      }
    } catch {
      // Runner may be busy or offline; proceed without git diff
    }
  }

  let state = validation.payload.state;
  if (state === undefined || state === null) {
    const stateParts: string[] = [];
    if (session.repoPath && !session.noProject) {
      stateParts.push(`Repository: ${session.repoPath}`);
    }
    if (gitDiff) {
      stateParts.push(`Git Diff:\n\`\`\`diff\n${gitDiff}\n\`\`\``);
    }
    state = stateParts.length > 0 ? stateParts.join("\n\n") : "";
  } else if (typeof state === "object") {
    state = JSON.stringify(state);
  }

  const payload = {
    model: validation.payload.model || jevConfig.model,
    state,
    questions: validation.payload.questions,
  };

  const url =
    process.env.TYPESAFE_API_URL ||
    `${(process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai/v1").replace(/\/+$/, "")}/systemone`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), jevConfig.timeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jevConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Jev API HTTP ${res.status}: ${errText}`);
    }

    const raw = (await res.json()) as JevResponse;
    const answers = raw.answers;
    if (!answers || typeof answers !== "object") {
      throw new Error(raw.error?.message || "Jev did not return valid answers");
    }

    const durationMs = Date.now() - startedAt;

    const formatted = formatDecisionResults({
      questions: validation.payload.questions,
      answers,
      model: payload.model,
      durationMs,
    });

    await appendSessionLog(session.id, systemMessageId, "agent", `${formatted.markdown}\n`, true);
    eventBus.publish({
      type: "terminal_output",
      payload: {
        sessionId: session.id,
        messageId: systemMessageId,
        data: formatted.plainText,
      },
    });

    const updatedSession = await updateSession(session.id, {
      status: "done",
      completedAt: new Date().toISOString(),
    });

    const returnMsg = await addMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: `✅ Decision complete: ${formatted.summary}`,
      type: "agent-return",
      parentId: systemMessageId,
      tokenUuid: session.tokenUuid,
    });

    eventBus.publish({ type: "session_updated", payload: updatedSession });
    eventBus.publish({ type: "message_added", payload: returnMsg });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await appendSessionLog(session.id, systemMessageId, "agent", `❌ Decision failed: ${errorMsg}\n`, true);
    eventBus.publish({
      type: "terminal_output",
      payload: {
        sessionId: session.id,
        messageId: systemMessageId,
        data: `\r\n❌ Decision failed: ${errorMsg}\r\n`,
      },
    });

    const updatedSession = await updateSession(session.id, {
      status: "error",
      errorMessage: errorMsg,
      completedAt: new Date().toISOString(),
    });

    const returnMsg = await addMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: `❌ ${errorMsg}`,
      type: "agent-return",
      parentId: systemMessageId,
      tokenUuid: session.tokenUuid,
    });

    eventBus.publish({ type: "session_updated", payload: updatedSession });
    eventBus.publish({ type: "message_added", payload: returnMsg });
  }
}
