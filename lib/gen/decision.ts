import { generateObject } from "ai";
import { z } from "zod";
import {
  getSession,
  getMessages,
  getSessionLog,
  type Session,
  type Project,
} from "../store";
import { getAnyLlmConfig } from "../llm/config";
import { createLlmModel } from "../llm/model";
import { stripAnsi } from "../ansi";
import type { GenMessage, GenMemory } from "./store";

export const MAX_SUB_SESSION_REUSE_IDLE_MS = 6 * 60 * 60 * 1000;

export const GenDecisionSchema = z.object({
  action: z.enum(["ask_user", "delegate_agent", "direct_reply"]),
  messageToUser: z.string(),
  noProject: z.boolean().optional(),
  projectId: z.string().optional(),
  runnerId: z.string().optional(),
  repoPath: z.string().optional(),
  continuePreviousSession: z.boolean().optional(),
  subAgentPrompt: z.string().optional(),
  memoryFactsToAdd: z.array(z.string()).optional(),
});

export type GenDecision = z.infer<typeof GenDecisionSchema>;

export const SubSessionRelevanceSchema = z.object({
  related: z.boolean(),
  reason: z.string(),
});

export interface AccessibleContext {
  runners: Array<{ id: string; name: string; hostname: string; agents: string[] }>;
  projects: Array<Project & { folderName: string; runnerName: string }>;
}

export function isExplicitNewSessionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("new session") ||
    lower.includes("new task") ||
    lower.includes("新しいセッション") ||
    lower.includes("新しいタスク") ||
    lower.includes("別タスク") ||
    lower.includes("別の件") ||
    lower.includes("新会话") ||
    lower.includes("新任务") ||
    lower.includes("另一个任务")
  );
}

export function isWithinReuseWindow(sub: NonNullable<GenMessage["subAgent"]>): boolean {
  const ts = Date.parse(sub.completedAt || sub.startedAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts <= MAX_SUB_SESSION_REUSE_IDLE_MS;
}

export function hasRecentSubSessionForTarget(
  messages: GenMessage[],
  runnerId: string,
  repoPath: string,
  noProject: boolean,
): boolean {
  return messages.some((m) => {
    const sub = m.subAgent;
    if (!sub || sub.status === "running") return false;
    if (!isWithinReuseWindow(sub)) return false;
    if (noProject) {
      return Boolean(sub.noProject) && sub.runnerId === runnerId;
    }
    return !sub.noProject && sub.runnerId === runnerId && sub.repoPath === repoPath;
  });
}

export interface CandidateSubSession {
  session: Session;
  previousGenMsg: GenMessage;
  turnNumber: number;
  sessionTranscript: string;
}

export async function findCandidateSubSessionForTarget(
  allMessages: GenMessage[],
  runnerId: string,
  repoPath: string,
  noProject: boolean,
  clientId?: string | null,
): Promise<CandidateSubSession | null> {
  const matchingGenMsgs = allMessages.filter((m) => {
    const sub = m.subAgent;
    if (!sub) return false;
    if (noProject) {
      return Boolean(sub.noProject) && sub.runnerId === runnerId;
    }
    return !sub.noProject && sub.runnerId === runnerId && sub.repoPath === repoPath;
  });

  if (matchingGenMsgs.length === 0) return null;

  const latestMsg = matchingGenMsgs[matchingGenMsgs.length - 1];
  const latestSub = latestMsg.subAgent!;
  if (latestSub.status === "running" || !isWithinReuseWindow(latestSub)) {
    return null;
  }

  const existingSession = await getSession(latestSub.subSessionId);
  if (!existingSession || existingSession.status === "running") {
    return null;
  }
  if (clientId && existingSession.tokenUuid && existingSession.tokenUuid !== clientId) {
    return null;
  }

  const subMessages = await getMessages(existingSession.id);
  const transcriptParts: string[] = [];
  for (const m of subMessages) {
    if (m.type === "chat-user") {
      transcriptParts.push(`User Prompt (${m.createdAt}): ${m.prompt || m.content}`);
    } else if (m.type === "agent-run") {
      const rawLog = await getSessionLog(existingSession.id, m.id, "agent");
      const cleanLog = stripAnsi(rawLog).trim();
      if (cleanLog) {
        transcriptParts.push(`Sub-Agent Output (${m.createdAt}): ${cleanLog.slice(-1000)}`);
      }
    }
  }

  const turnsInGenMessages = allMessages.filter(
    (m) => m.subAgent?.subSessionId === existingSession.id,
  ).length;
  const turnsInSessionMessages = subMessages.filter((m) => m.type === "agent-run").length;
  const completedTurns = Math.max(turnsInGenMessages, turnsInSessionMessages, 1);

  return {
    session: existingSession,
    previousGenMsg: latestMsg,
    turnNumber: completedTurns + 1,
    sessionTranscript: transcriptParts.slice(-8).join("\n\n"),
  };
}

export async function shouldReuseCandidateSubSession(
  userText: string,
  subAgentPrompt: string,
  repoPath: string,
  noProject: boolean,
  candidate: CandidateSubSession,
): Promise<boolean> {
  if (isExplicitNewSessionRequest(userText)) {
    return false;
  }

  const llmConfig = getAnyLlmConfig(15_000);
  if (!llmConfig) {
    return true;
  }

  try {
    const model = createLlmModel(llmConfig.provider, llmConfig.model, llmConfig.apiKey);
    const res = await generateObject({
      model,
      schema: SubSessionRelevanceSchema,
      prompt: [
        "Determine whether the new request for this repository is related to the most recent Sub-Agent session of THIS repository and should reuse the same session.",
        "Important: Even if other repositories were queried in between, you are only comparing the latest session of THIS target repository with the new message for THIS target repository.",
        "",
        "Set `related: true` if ANY of the following apply:",
        "- The new request modifies, fixes, tests, commits, inspects, or follows up on files, scripts, or changes from the previous session messages.",
        "- The new request is a natural next step in the same workflow (for example: summarizing scripts -> modifying a script -> committing the changes in the repo).",
        "- The new request continues working on the same topic or current working tree changes of this repository.",
        "",
        "Set `related: false` ONLY when the new request is a completely independent, unrelated topic where prior session context would not be useful.",
        "",
        `Target Repository: ${noProject ? "(No Project / Temporary Workspace)" : repoPath}`,
        `Latest Session ID for this Repository: ${candidate.session.id}`,
        "",
        "Messages from the latest session of this repository:",
        candidate.sessionTranscript || `(Previous prompt: ${candidate.previousGenMsg.subAgent?.prompt || ""})`,
        "",
        `New User Message:\n${userText}`,
        "",
        `Resolved Task Prompt for Sub-Agent:\n${subAgentPrompt}`,
      ].join("\n"),
    });
    return res.object.related;
  } catch (err) {
    console.warn("[gen] Sub-session relevance check failed, defaulting to reuse:", err);
    return true;
  }
}

export function buildHeuristicDecision(
  userText: string,
  ctx: AccessibleContext,
  memory: GenMemory,
  recentMessages: GenMessage[],
): z.infer<typeof GenDecisionSchema> {
  if (ctx.runners.length === 0) {
    return {
      action: "direct_reply",
      messageToUser: "⚠️ No Runner is currently connected. Please connect a Runner and try again.",
    };
  }

  const lower = userText.toLowerCase();
  const explicitNewSession = isExplicitNewSessionRequest(userText);
  const explicitNoProject =
    lower.includes("no project") ||
    lower.includes("noproject") ||
    lower.includes("プロジェクトなし") ||
    lower.includes("空プロジェクト") ||
    lower.includes("不需要项目") ||
    lower.includes("不用项目") ||
    lower.includes("空");

  const matchedProjects = ctx.projects.filter(
    (p) =>
      lower.includes(p.folderName.toLowerCase()) ||
      lower.includes(p.repoPath.toLowerCase()),
  );

  // Check if the previous Gen message was asking the user to clarify the project
  const prevGenMsg = [...recentMessages].reverse().find((m) => m.role === "gen");
  const prevUserMsg = [...recentMessages]
    .slice(0, -1)
    .reverse()
    .find((m) => m.role === "user");
  const wasAskingProject =
    prevGenMsg &&
    !prevGenMsg.subAgent &&
    (prevGenMsg.content.includes("Project") ||
      prevGenMsg.content.includes("プロジェクト") ||
      prevGenMsg.content.includes("リポジトリ") ||
      prevGenMsg.content.includes("項目") ||
      prevGenMsg.content.includes("项目"));

  const effectivePrompt =
    wasAskingProject && prevUserMsg && (matchedProjects.length === 1 || explicitNoProject)
      ? `${prevUserMsg.content}\n\n(Target clarification: ${userText})`
      : userText;

  if (explicitNoProject) {
    const runner = ctx.runners.find((r) => r.id === memory.lastRunnerId) || ctx.runners[0];
    const shouldContinue =
      !explicitNewSession &&
      !wasAskingProject &&
      hasRecentSubSessionForTarget(recentMessages, runner.id, "", true);
    return {
      action: "delegate_agent",
      messageToUser: shouldContinue
        ? `Continuing the previous Sub Agent session on Runner \`${runner.name}\` (No Project).`
        : `Delegating the task to a Sub Agent on Runner \`${runner.name}\` without a Project (temporary workspace).`,
      noProject: true,
      runnerId: runner.id,
      continuePreviousSession: shouldContinue,
      subAgentPrompt: effectivePrompt,
    };
  }

  if (matchedProjects.length === 1) {
    const proj = matchedProjects[0];
    const shouldContinue =
      !explicitNewSession &&
      !wasAskingProject &&
      hasRecentSubSessionForTarget(recentMessages, proj.runnerId, proj.repoPath, false);
    return {
      action: "delegate_agent",
      messageToUser: shouldContinue
        ? `Continuing the Sub Agent session in Project \`${proj.folderName}\` (\`${proj.repoPath}\` @ \`${proj.runnerName}\`).`
        : `Starting a Sub Agent in Project \`${proj.folderName}\` (\`${proj.repoPath}\` @ \`${proj.runnerName}\`).`,
      noProject: false,
      projectId: proj.id,
      runnerId: proj.runnerId,
      repoPath: proj.repoPath,
      continuePreviousSession: shouldContinue,
      subAgentPrompt: effectivePrompt,
      memoryFactsToAdd: [`Recent project: ${proj.folderName} (${proj.repoPath} on ${proj.runnerId})`],
    };
  }

  if (ctx.projects.length === 1) {
    const proj = ctx.projects[0];
    const shouldContinue =
      !explicitNewSession &&
      hasRecentSubSessionForTarget(recentMessages, proj.runnerId, proj.repoPath, false);
    return {
      action: "delegate_agent",
      messageToUser: shouldContinue
        ? `Continuing the Sub Agent session in the registered Project \`${proj.folderName}\` (\`${proj.repoPath}\`).`
        : `Starting a Sub Agent in the registered Project \`${proj.folderName}\` (\`${proj.repoPath}\`).`,
      noProject: false,
      projectId: proj.id,
      runnerId: proj.runnerId,
      repoPath: proj.repoPath,
      continuePreviousSession: shouldContinue,
      subAgentPrompt: effectivePrompt,
    };
  }

  if (ctx.projects.length === 0) {
    const runner = ctx.runners[0];
    const shouldContinue =
      !explicitNewSession &&
      hasRecentSubSessionForTarget(recentMessages, runner.id, "", true);
    return {
      action: "delegate_agent",
      messageToUser: shouldContinue
        ? `Continuing the Sub Agent session in the temporary workspace (no Project) on Runner \`${runner.name}\`.`
        : `No Project is registered, so starting a Sub Agent in a temporary workspace (no Project) on Runner \`${runner.name}\`.`,
      noProject: true,
      runnerId: runner.id,
      continuePreviousSession: shouldContinue,
      subAgentPrompt: effectivePrompt,
    };
  }

  // If multiple projects exist and the user didn't repeat the project name,
  // check if there is an active/recent Sub-Agent session in recent conversation to continue.
  const lastCompletedSubMsg = [...recentMessages]
    .reverse()
    .find((m) => m.subAgent && m.subAgent.status !== "running" && isWithinReuseWindow(m.subAgent));

  if (!explicitNewSession && !wasAskingProject && lastCompletedSubMsg?.subAgent) {
    const prevSub = lastCompletedSubMsg.subAgent;
    if (prevSub.noProject) {
      const runner = ctx.runners.find((r) => r.id === prevSub.runnerId);
      if (runner) {
        return {
          action: "delegate_agent",
          messageToUser: `Continuing the previous Sub Agent session on Runner \`${runner.name}\` (No Project).`,
          noProject: true,
          runnerId: runner.id,
          continuePreviousSession: true,
          subAgentPrompt: effectivePrompt,
        };
      }
    } else {
      const proj = ctx.projects.find(
        (p) => p.runnerId === prevSub.runnerId && p.repoPath === prevSub.repoPath,
      );
      if (proj) {
        return {
          action: "delegate_agent",
          messageToUser: `Continuing the Sub Agent session in Project \`${proj.folderName}\` (\`${proj.repoPath}\` @ \`${proj.runnerName}\`).`,
          noProject: false,
          projectId: proj.id,
          runnerId: proj.runnerId,
          repoPath: proj.repoPath,
          continuePreviousSession: true,
          subAgentPrompt: effectivePrompt,
        };
      }
    }
  }

  const projectListText = ctx.projects
    .map((p) => `- **${p.folderName}** (\`${p.repoPath}\` on \`${p.runnerName}\`)`)
    .join("\n");

  return {
    action: "ask_user",
    messageToUser: [
      "I could not determine which Project to use. Please specify the target Project name, or tell me to run without a Project:",
      "",
      projectListText,
      "- **No Project** (run in a temporary directory)",
    ].join("\n"),
  };
}

export async function decideGenAction(
  userText: string,
  ctx: AccessibleContext,
  memory: GenMemory,
  recentMessages: GenMessage[],
): Promise<z.infer<typeof GenDecisionSchema>> {
  if (ctx.runners.length === 0) {
    return buildHeuristicDecision(userText, ctx, memory, recentMessages);
  }

  const llmConfig = getAnyLlmConfig(20_000);
  if (!llmConfig) {
    return buildHeuristicDecision(userText, ctx, memory, recentMessages);
  }

  try {
    const model = createLlmModel(llmConfig.provider, llmConfig.model, llmConfig.apiKey);
    const historyText = recentMessages
      .map((m) => {
        const subInfo = m.subAgent
          ? ` [SubAgent: session=${m.subAgent.subSessionId} turn=#${m.subAgent.turnNumber || 1} ${m.subAgent.agentType} ${m.subAgent.model || ""} on ${m.subAgent.repoPath || "no-project"} -> ${m.subAgent.status}]`
          : "";
        return `${m.role === "user" ? "User" : "Gen"}${subInfo}: ${m.content}`;
      })
      .join("\n\n");

    const prompt = [
      "You are Gen, the built-in Main Agent orchestrator in Arondo.",
      "Your role is to coordinate tasks and delegate execution to a Sub Agent on a connected Runner.",
      "",
      "Rules:",
      "1. Determine whether the user's request targets a specific Project from the Available Projects list, or requires no project (`noProject: true`, e.g., general questions, standalone scripts, or tasks unrelated to local repositories). If the user is following up on the recent task without repeating the project name, infer the same Project (or `noProject`) from the recent conversation.",
      "2. If the user's request likely targets a repository/project, and it is ambiguous which project they mean (e.g., multiple projects exist and neither the message nor recent context/memory clearly identifies one), set `action: \"ask_user\"` and ask the user in `messageToUser` to clarify which Project (or No Project) to use.",
      "3. If the target Project (or `noProject: true`) is clear, set `action: \"delegate_agent\"`, populate `runnerId`, `repoPath` (when `noProject` is false), `noProject`, and write a clear, self-contained `subAgentPrompt` for the Sub Agent.",
      "4. Session Continuity (`continuePreviousSession`): Different Projects never share a session (`continuePreviousSession: false`). When delegating to the SAME Project (or both `noProject: true`) as a recent Sub-Agent run, set `continuePreviousSession: true` if the user's request is part of the same fix, iterative refinement, debugging, test update, commit, or related follow-up. Set `continuePreviousSession: false` if the user switches to an unrelated feature/task or explicitly asks for a new session/task.",
      "5. If the user is just greeting you or asking about your memory/status without needing a Sub Agent, set `action: \"direct_reply\"`.",
      "6. Respond in the same language the user used.",
      "",
      "Available Connected Runners:",
      JSON.stringify(ctx.runners, null, 2),
      "",
      "Available Projects:",
      JSON.stringify(
        ctx.projects.map((p) => ({
          projectId: p.id,
          folderName: p.folderName,
          repoPath: p.repoPath,
          runnerId: p.runnerId,
          runnerName: p.runnerName,
        })),
        null,
        2,
      ),
      "",
      "Gen Memory Summary:",
      memory.summary || "(empty)",
      "Gen Memory Facts:",
      memory.facts.join("\n") || "(empty)",
      `Last used Runner/Repo: runnerId=${memory.lastRunnerId || "none"}, repoPath=${memory.lastRepoPath || "none"}`,
      "",
      "Recent Conversation:",
      historyText || "(none)",
      "",
      `Latest User Message:\n${userText}`,
    ].join("\n");

    const result = await generateObject({
      model,
      schema: GenDecisionSchema,
      prompt,
    });
    return result.object;
  } catch (err) {
    console.warn("[gen] LLM decision failed, falling back to heuristic:", err);
    return buildHeuristicDecision(userText, ctx, memory, recentMessages);
  }
}
