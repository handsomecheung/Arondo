import crypto from "crypto";
import path from "path";
import { generateObject } from "ai";
import { z } from "zod";
import { eventBus } from "../event-bus";
import { runnerManager } from "../runner-manager";
import {
  getProjects,
  getSession,
  getMessages,
  getSessionLog,
  isGenSubSessionId,
  type Session,
  type Project,
} from "../store";
import { dispatchCreateSession, dispatchFollowupMessage } from "../session-actions";
import { getAnyLlmConfig } from "../llm/config";
import { createLlmModel } from "../llm/model";
import { stripAnsi } from "../ansi";
import { sendWebPushNotification } from "../web-push-server";
import { readTokensConfig, getUuidByToken } from "../auth";
import {
  getGenMessages,
  addGenMessage,
  updateGenMessage,
  getGenMemory,
  updateGenMemory,
  type GenMessage,
  type GenMemory,
} from "./store";

const RECENT_MESSAGE_WINDOW = 12;
const COMPACTION_THRESHOLD = 16;
const MAX_SUB_SESSION_REUSE_IDLE_MS = 6 * 60 * 60 * 1000;

const GenDecisionSchema = z.object({
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

const GenCompactionSchema = z.object({
  summary: z.string(),
  facts: z.array(z.string()),
});

const GenCompletionReplySchema = z.object({
  reply: z.string(),
  memoryFactsToAdd: z.array(z.string()).optional(),
});

const SubSessionRelevanceSchema = z.object({
  related: z.boolean(),
  reason: z.string(),
});

interface AccessibleContext {
  runners: Array<{ id: string; name: string; hostname: string; agents: string[] }>;
  projects: Array<Project & { folderName: string; runnerName: string }>;
}

async function getAccessibleContext(token: string | null): Promise<AccessibleContext> {
  const [allRunners, allProjects] = await Promise.all([
    runnerManager.getAllKnownRunners(),
    getProjects(),
  ]);

  const connectedRunners: AccessibleContext["runners"] = [];
  for (const r of allRunners) {
    if (!r.connected) continue;
    if (await runnerManager.isTokenAllowedForRunner(r, token)) {
      connectedRunners.push({
        id: r.id,
        name: r.name,
        hostname: r.hostname,
        agents: r.agents || [],
      });
    }
  }

  const runnerMap = new Map(connectedRunners.map((r) => [r.id, r]));
  const projects = allProjects
    .filter((p) => runnerMap.has(p.runnerId))
    .map((p) => ({
      ...p,
      folderName: path.basename(p.repoPath) || p.repoPath,
      runnerName: runnerMap.get(p.runnerId)?.name || p.runnerId,
    }));

  return { runners: connectedRunners, projects };
}

function broadcastGenUpdate(tokenUuid?: string): void {
  eventBus.publish({
    type: "gen_updated",
    payload: { tokenUuid, timestamp: Date.now() },
  });
}

async function compactGenMemoryIfNeeded(
  messages: GenMessage[],
  memory: GenMemory,
): Promise<void> {
  const uncompactedCount = messages.length - memory.compactedMessageCount;
  if (uncompactedCount < COMPACTION_THRESHOLD) return;

  const toCompact = messages.slice(
    memory.compactedMessageCount,
    messages.length - RECENT_MESSAGE_WINDOW,
  );
  if (toCompact.length === 0) return;

  const transcript = toCompact
    .map((m) => `${m.role === "user" ? "User" : "Gen"}: ${m.content}`)
    .join("\n\n");

  const llmConfig = getAnyLlmConfig(15_000);
  if (llmConfig) {
    try {
      const model = createLlmModel(llmConfig.provider, llmConfig.model, llmConfig.apiKey);
      const res = await generateObject({
        model,
        schema: GenCompactionSchema,
        prompt: [
          "You are Gen, the Main Agent orchestrator in Arondo.",
          "Compress the older conversation turns into a concise rolling summary and extract durable facts (such as project paths, user preferences, and completed milestones).",
          "",
          `Existing summary:\n${memory.summary || "(none)"}`,
          `Existing facts:\n${memory.facts.join("\n") || "(none)"}`,
          "",
          `Turns to compact:\n${transcript}`,
        ].join("\n"),
      });
      await updateGenMemory({
        summary: res.object.summary,
        facts: res.object.facts.slice(0, 30),
        compactedMessageCount: messages.length - RECENT_MESSAGE_WINDOW,
      });
      return;
    } catch (err) {
      console.warn("[gen] LLM memory compaction failed, using fallback:", err);
    }
  }

  const fallbackAddition = toCompact
    .map((m) => `[${m.role}] ${m.content.slice(0, 160)}`)
    .join(" | ");
  const mergedSummary = [memory.summary, fallbackAddition].filter(Boolean).join("\n").slice(-2000);
  await updateGenMemory({
    summary: mergedSummary,
    compactedMessageCount: messages.length - RECENT_MESSAGE_WINDOW,
  });
}

function isExplicitNewSessionRequest(text: string): boolean {
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

function isWithinReuseWindow(sub: NonNullable<GenMessage["subAgent"]>): boolean {
  const ts = Date.parse(sub.completedAt || sub.startedAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts <= MAX_SUB_SESSION_REUSE_IDLE_MS;
}

function hasRecentSubSessionForTarget(
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

interface CandidateSubSession {
  session: Session;
  previousGenMsg: GenMessage;
  turnNumber: number;
  sessionTranscript: string;
}

async function findCandidateSubSessionForTarget(
  allMessages: GenMessage[],
  runnerId: string,
  repoPath: string,
  noProject: boolean,
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
    sessionTranscript: transcriptParts.join("\n\n").slice(-6000),
  };
}

async function shouldReuseCandidateSubSession(
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

function buildHeuristicDecision(
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

async function decideGenAction(
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

export async function handleUserGenMessage(
  content: string,
  token: string | null,
): Promise<{ ok: boolean; error?: string; userMessage?: GenMessage; genMessage?: GenMessage }> {
  await reconcileRunningGenSubAgents();

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Message is required" };
  }

  let tokenUuid: string | undefined;
  let userName: string | undefined;
  let userColor: string | undefined;
  if (token) {
    tokenUuid = getUuidByToken(token) || undefined;
    if (tokenUuid) {
      try {
        const authConfig = await readTokensConfig();
        const client = authConfig.clients.find((c) => c.uuid === tokenUuid);
        if (client) {
          userName = client.name;
          userColor = client.color;
        }
      } catch {
        // Ignore user profile lookup errors
      }
    }
  }

  const userMessage = await addGenMessage({
    role: "user",
    content: trimmed,
    tokenUuid,
    userName,
    userColor,
  });
  broadcastGenUpdate(tokenUuid);

  const [allMessages, memory, ctx] = await Promise.all([
    getGenMessages(),
    getGenMemory(),
    getAccessibleContext(token),
  ]);

  const recentMessages = allMessages.slice(-RECENT_MESSAGE_WINDOW);
  const decision = await decideGenAction(trimmed, ctx, memory, recentMessages);

  if (decision.memoryFactsToAdd && decision.memoryFactsToAdd.length > 0) {
    const mergedFacts = Array.from(new Set([...memory.facts, ...decision.memoryFactsToAdd])).slice(-30);
    await updateGenMemory({ facts: mergedFacts });
  }

  if (decision.action === "ask_user" || decision.action === "direct_reply") {
    const genMessage = await addGenMessage({
      role: "gen",
      content: decision.messageToUser,
      tokenUuid,
    });
    const updatedMessages = await getGenMessages();
    const updatedMemory = await getGenMemory();
    await compactGenMemoryIfNeeded(updatedMessages, updatedMemory);
    broadcastGenUpdate(tokenUuid);
    return { ok: true, userMessage, genMessage };
  }

  // delegate_agent
  const noProject = decision.noProject === true || (!decision.repoPath && !decision.projectId);
  const matchedProject = decision.projectId
    ? ctx.projects.find((p) => p.id === decision.projectId)
    : decision.repoPath
      ? ctx.projects.find((p) => p.repoPath === decision.repoPath)
      : undefined;

  const targetRunnerId =
    matchedProject?.runnerId ||
    (decision.runnerId && ctx.runners.some((r) => r.id === decision.runnerId)
      ? decision.runnerId
      : ctx.runners[0]?.id);

  if (!targetRunnerId) {
    const genMessage = await addGenMessage({
      role: "gen",
      content: "⚠️ No available Runner was found.",
      tokenUuid,
    });
    broadcastGenUpdate(tokenUuid);
    return { ok: true, userMessage, genMessage };
  }

  const runnerInfo = ctx.runners.find((r) => r.id === targetRunnerId);
  let targetRepoPath = matchedProject?.repoPath || decision.repoPath || "";
  const subAgentPrompt = decision.subAgentPrompt?.trim() || trimmed;

  // Step 2: Look up the most recent Sub-Agent session for THIS target project/repository
  // (ignoring any intervening sessions for other repositories) and check if its messages
  // are related to the new message.
  const candidate = await findCandidateSubSessionForTarget(
    allMessages,
    targetRunnerId,
    targetRepoPath,
    noProject,
  );
  const shouldReuse = candidate
    ? await shouldReuseCandidateSubSession(
        trimmed,
        subAgentPrompt,
        targetRepoPath,
        noProject,
        candidate,
      )
    : false;
  const reusable = shouldReuse ? candidate : null;

  let subSessionId: string;
  let turnNumber = 1;
  let isContinuedSession = false;
  let continuedFromGenMessageId: string | undefined;

  if (reusable) {
    subSessionId = reusable.session.id;
    turnNumber = reusable.turnNumber;
    isContinuedSession = true;
    continuedFromGenMessageId = reusable.previousGenMsg.id;
    if (noProject && reusable.session.repoPath) {
      targetRepoPath = reusable.session.repoPath;
    }
  } else {
    subSessionId = `gen-sub-${crypto.randomUUID()}`;
    if (noProject || !targetRepoPath) {
      try {
        const mkdtempRes = await runnerManager.sendRequest(
          targetRunnerId,
          "fs.mkdtemp",
          { purpose: "no-project-session" },
          10_000,
        );
        if (!mkdtempRes?.path || typeof mkdtempRes.path !== "string") {
          throw new Error("Runner did not return a valid workspace path");
        }
        targetRepoPath = mkdtempRes.path;
      } catch (err: any) {
        const genMessage = await addGenMessage({
          role: "gen",
          content: `❌ Failed to create a temporary workspace on the Runner: ${err?.message || String(err)}`,
          tokenUuid,
        });
        broadcastGenUpdate(tokenUuid);
        return { ok: true, userMessage, genMessage };
      }
    }
  }

  const startedAt = new Date().toISOString();

  dispatchingSubSessionIds.add(subSessionId);
  let genMessage: GenMessage;
  try {
    genMessage = await addGenMessage({
      role: "gen",
      content:
        decision.messageToUser ||
        (isContinuedSession
          ? `Continuing the Sub Agent session (Turn #${turnNumber}). Please wait for it to complete…`
          : "The task has been delegated to a Sub Agent. Please wait for it to complete…"),
      tokenUuid,
      subAgent: {
        subSessionId,
        runnerId: targetRunnerId,
        runnerName: runnerInfo?.name || targetRunnerId,
        repoPath: noProject ? "" : targetRepoPath,
        noProject,
        agentType: reusable?.session.autoLockedAgentType || reusable?.session.agentType || "auto",
        model: reusable?.session.autoLockedAgentModel || reusable?.session.model,
        status: "running",
        prompt: subAgentPrompt,
        startedAt,
        turnNumber,
        isContinuedSession,
        continuedFromGenMessageId,
      },
    });
    broadcastGenUpdate(tokenUuid);

    const dispatchRes = isContinuedSession
      ? await dispatchFollowupMessage(subSessionId, subAgentPrompt, {
          prompt: subAgentPrompt,
          tokenUuid,
        })
      : await dispatchCreateSession(targetRunnerId, targetRepoPath, "auto", subAgentPrompt, {
          id: subSessionId,
          tokenUuid,
          noProject,
        });

    if (!dispatchRes.ok) {
      await updateGenMessage(genMessage.id, {
        subAgent: {
          ...genMessage.subAgent!,
          status: "error",
          errorMessage: dispatchRes.error,
          completedAt: new Date().toISOString(),
        },
      });
      await addGenMessage({
        role: "gen",
        content: `❌ Failed to start the Sub Agent: ${dispatchRes.error}`,
        tokenUuid,
      });
      broadcastGenUpdate(tokenUuid);
      return { ok: true, userMessage, genMessage };
    }

    // Update subAgent card with resolved Agent, Model, and Thinking Effort for this turn
    const subMessages = await getMessages(subSessionId);
    const runMsg = [...subMessages].reverse().find((m) => m.type === "agent-run");
    if (runMsg) {
      const latestGenMsgs = await getGenMessages();
      const currentGenMsg = latestGenMsgs.find((m) => m.id === genMessage.id);
      if (currentGenMsg?.subAgent) {
        await updateGenMessage(genMessage.id, {
          subAgent: {
            ...currentGenMsg.subAgent,
            messageId: runMsg.id,
            agentType: runMsg.resolvedAgentType || currentGenMsg.subAgent.agentType || "auto",
            model: runMsg.resolvedModel ?? currentGenMsg.subAgent.model,
            effort: runMsg.resolvedEffort ?? currentGenMsg.subAgent.effort,
          },
        });
      }
    }
  } finally {
    dispatchingSubSessionIds.delete(subSessionId);
  }

  await updateGenMemory({
    lastRunnerId: targetRunnerId,
    lastRepoPath: noProject ? memory.lastRepoPath : targetRepoPath,
  });

  // In case the sub-agent finished while we were dispatching or updating the message metadata
  const latestSubSession = await getSession(subSessionId);
  if (
    latestSubSession &&
    (latestSubSession.status === "done" || latestSubSession.status === "error")
  ) {
    await onSubAgentSessionFinished(latestSubSession);
  }

  broadcastGenUpdate(tokenUuid);
  const finalGenMsgs = await getGenMessages();
  const finalGenMessage = finalGenMsgs.find((m) => m.id === genMessage.id) || genMessage;
  return { ok: true, userMessage, genMessage: finalGenMessage };
}

const handledSubGenMessageIds = new Set<string>();
const dispatchingSubSessionIds = new Set<string>();

async function onSubAgentSessionFinished(subSession: Session): Promise<void> {
  if (dispatchingSubSessionIds.has(subSession.id)) return;

  try {
    const [genMessages, subMessages] = await Promise.all([
      getGenMessages(),
      getMessages(subSession.id),
    ]);

    const parentGenMsg = [...genMessages]
      .reverse()
      .find((m) => m.subAgent?.subSessionId === subSession.id && m.subAgent.status === "running");
    if (!parentGenMsg || !parentGenMsg.subAgent) return;

    const runMsgId = parentGenMsg.subAgent.messageId;
    if (!runMsgId) return;

    const runMsg = subMessages.find((m) => m.id === runMsgId);
    if (!runMsg) return;

    const returnMsg = [...subMessages]
      .reverse()
      .find((m) => m.type === "agent-return" && m.parentId === runMsg.id);
    if (!returnMsg) return;

    if (handledSubGenMessageIds.has(parentGenMsg.id)) return;
    handledSubGenMessageIds.add(parentGenMsg.id);

    const stoppedByUser = Boolean(runMsg?.stoppedByUser || returnMsg?.content.startsWith("🛑"));
    const isSuccess = subSession.status === "done" && !stoppedByUser;

    const rawLog = runMsg
      ? await getSessionLog(subSession.id, runMsg.id, "agent")
      : "";
    const cleanOutput = stripAnsi(rawLog).trim();

    const finalStatus: "done" | "error" | "stopped" = stoppedByUser
      ? "stopped"
      : isSuccess
        ? "done"
        : "error";

    await updateGenMessage(parentGenMsg.id, {
      subAgent: {
        ...parentGenMsg.subAgent,
        messageId: runMsg?.id || parentGenMsg.subAgent.messageId,
        agentType: runMsg?.resolvedAgentType || parentGenMsg.subAgent.agentType,
        model: runMsg?.resolvedModel ?? parentGenMsg.subAgent.model,
        effort: runMsg?.resolvedEffort ?? parentGenMsg.subAgent.effort,
        status: finalStatus,
        completedAt: new Date().toISOString(),
        errorMessage: subSession.errorMessage,
      },
    });

    let replyContent = "";
    const llmConfig = getAnyLlmConfig(15_000);
    if (stoppedByUser) {
      replyContent = "🛑 The Sub Agent execution was stopped.";
    } else if (!isSuccess) {
      const errDetail = subSession.errorMessage || "Sub Agent exited with an error.";
      replyContent = cleanOutput
        ? `❌ The Sub Agent encountered an error during execution (${errDetail}):\n\n${cleanOutput.slice(-2000)}`
        : `❌ The Sub Agent encountered an error during execution: ${errDetail}`;
    } else if (llmConfig && cleanOutput) {
      try {
        const model = createLlmModel(llmConfig.provider, llmConfig.model, llmConfig.apiKey);
        const res = await generateObject({
          model,
          schema: GenCompletionReplySchema,
          prompt: [
            "You are Gen, the Main Agent orchestrator in Arondo.",
            "Your delegated Sub Agent has just finished executing the task.",
            "Present or summarize the Sub Agent's result clearly and concisely for the user in the same language as the original request.",
            "",
            `Task prompt delegated to Sub Agent:\n${parentGenMsg.subAgent.prompt}`,
            "",
            `Sub Agent Output:\n${cleanOutput.slice(-12000)}`,
          ].join("\n"),
        });
        replyContent = res.object.reply;
        if (res.object.memoryFactsToAdd && res.object.memoryFactsToAdd.length > 0) {
          const mem = await getGenMemory();
          const merged = Array.from(new Set([...mem.facts, ...res.object.memoryFactsToAdd])).slice(-30);
          await updateGenMemory({ facts: merged });
        }
      } catch {
        replyContent = cleanOutput;
      }
    } else {
      replyContent = cleanOutput || "✅ The Sub Agent completed the task.";
    }

    const tokenUuid = parentGenMsg.tokenUuid || subSession.tokenUuid;
    await addGenMessage({
      role: "gen",
      content: replyContent,
      tokenUuid,
    });

    const [updatedMessages, updatedMemory] = await Promise.all([
      getGenMessages(),
      getGenMemory(),
    ]);
    await compactGenMemoryIfNeeded(updatedMessages, updatedMemory);

    broadcastGenUpdate(tokenUuid);

    if (!stoppedByUser) {
      const preview = replyContent.replace(/\s+/g, " ").trim().slice(0, 140);
      await sendWebPushNotification(
        {
          title: isSuccess ? "✅ Gen Task Completed" : "❌ Gen Task Failed",
          body: preview || (isSuccess ? "Gen completed your request." : "Gen sub-agent encountered an error."),
          url: "/gen",
          tag: `gen-${subSession.id}`,
        },
        tokenUuid,
      ).catch((err) => {
        console.error("[gen] Failed to send web push notification:", err);
      });
    }
  } catch (err) {
    console.error("[gen] Error handling sub-agent completion:", err);
  }
}

const p = process as typeof process & { __arondoGenOrchestratorInit?: boolean };

export function ensureGenOrchestratorInitialized(): void {
  if (p.__arondoGenOrchestratorInit) return;
  p.__arondoGenOrchestratorInit = true;

  eventBus.subscribe((event) => {
    if (event.type === "session_updated" && event.payload) {
      const session = event.payload as Session;
      if (
        session.id &&
        isGenSubSessionId(session.id) &&
        (session.status === "done" || session.status === "error")
      ) {
        onSubAgentSessionFinished(session).catch((err) => {
          console.error("[gen] onSubAgentSessionFinished error:", err);
        });
      }
    }
  });
}

export async function reconcileRunningGenSubAgents(): Promise<void> {
  ensureGenOrchestratorInitialized();
  const messages = await getGenMessages();
  for (const msg of messages) {
    if (msg.subAgent?.status === "running") {
      const subSession = await getSession(msg.subAgent.subSessionId);
      if (subSession && (subSession.status === "done" || subSession.status === "error")) {
        await onSubAgentSessionFinished(subSession);
      }
    }
  }
}

ensureGenOrchestratorInitialized();
