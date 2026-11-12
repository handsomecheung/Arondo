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
  getAllGenClientIds,
  type GenMessage,
  type GenMemory,
} from "./store";
import {
  decideGenAction,
  findCandidateSubSessionForTarget,
  shouldReuseCandidateSubSession,
  type AccessibleContext,
} from "./decision";
import { registerGenSubSession, getDefaultClientId } from "./sub-sessions";

const RECENT_MESSAGE_WINDOW = 12;
const COMPACTION_THRESHOLD = 16;

const GenCompactionSchema = z.object({
  summary: z.string(),
  facts: z.array(z.string()),
});

const GenCompletionReplySchema = z.object({
  reply: z.string(),
  memoryFactsToAdd: z.array(z.string()).optional(),
});

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
  clientId?: string | null,
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
      }, clientId);
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
  }, clientId);
}

export async function handleUserGenMessage(
  content: string,
  token: string | null,
): Promise<{ ok: boolean; error?: string; userMessage?: GenMessage; genMessage?: GenMessage }> {
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

  await reconcileRunningGenSubAgents(tokenUuid);

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Message is required" };
  }

  const userMessage = await addGenMessage({
    role: "user",
    content: trimmed,
    tokenUuid,
    userName,
    userColor,
  }, tokenUuid);
  broadcastGenUpdate(tokenUuid);

  const [allMessages, memory, ctx] = await Promise.all([
    getGenMessages(tokenUuid),
    getGenMemory(tokenUuid),
    getAccessibleContext(token),
  ]);

  const recentMessages = allMessages.slice(-RECENT_MESSAGE_WINDOW);
  const decision = await decideGenAction(trimmed, ctx, memory, recentMessages);

  if (decision.memoryFactsToAdd && decision.memoryFactsToAdd.length > 0) {
    const mergedFacts = Array.from(new Set([...memory.facts, ...decision.memoryFactsToAdd])).slice(-30);
    await updateGenMemory({ facts: mergedFacts }, tokenUuid);
  }

  if (decision.action === "ask_user" || decision.action === "direct_reply") {
    const genMessage = await addGenMessage({
      role: "gen",
      content: decision.messageToUser,
      tokenUuid,
    }, tokenUuid);
    const updatedMessages = await getGenMessages(tokenUuid);
    const updatedMemory = await getGenMemory(tokenUuid);
    await compactGenMemoryIfNeeded(updatedMessages, updatedMemory, tokenUuid);
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
    }, tokenUuid);
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
    tokenUuid,
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
    if (tokenUuid) {
      registerGenSubSession(subSessionId, tokenUuid);
    }
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
        }, tokenUuid);
        broadcastGenUpdate(tokenUuid);
        return { ok: true, userMessage, genMessage };
      }
    }
  }

  const startedAt = new Date().toISOString();
  const runtimeState = getClientRuntimeState(tokenUuid);

  runtimeState.dispatchingSubSessionIds.add(subSessionId);
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
    }, tokenUuid);
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
      }, tokenUuid);
      await addGenMessage({
        role: "gen",
        content: `❌ Failed to start the Sub Agent: ${dispatchRes.error}`,
        tokenUuid,
      }, tokenUuid);
      broadcastGenUpdate(tokenUuid);
      return { ok: true, userMessage, genMessage };
    }

    // Update subAgent card with resolved Agent, Model, and Thinking Effort for this turn
    const subMessages = await getMessages(subSessionId);
    const runMsg = [...subMessages].reverse().find((m) => m.type === "agent-run");
    if (runMsg) {
      const latestGenMsgs = await getGenMessages(tokenUuid);
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
        }, tokenUuid);
      }
    }
  } finally {
    runtimeState.dispatchingSubSessionIds.delete(subSessionId);
  }

  await updateGenMemory({
    lastRunnerId: targetRunnerId,
    lastRepoPath: noProject ? memory.lastRepoPath : targetRepoPath,
  }, tokenUuid);

  // In case the sub-agent finished while we were dispatching or updating the message metadata
  const latestSubSession = await getSession(subSessionId);
  if (
    latestSubSession &&
    (latestSubSession.status === "done" || latestSubSession.status === "error")
  ) {
    await onSubAgentSessionFinished(latestSubSession);
  }

  broadcastGenUpdate(tokenUuid);
  const finalGenMsgs = await getGenMessages(tokenUuid);
  const finalGenMessage = finalGenMsgs.find((m) => m.id === genMessage.id) || genMessage;
  return { ok: true, userMessage, genMessage: finalGenMessage };
}

interface ClientGenRuntimeState {
  handledSubGenMessageIds: Set<string>;
  dispatchingSubSessionIds: Set<string>;
}

const clientRuntimeStates = new Map<string, ClientGenRuntimeState>();

function getClientRuntimeState(clientId?: string | null): ClientGenRuntimeState {
  const key = clientId && clientId.trim() ? clientId.trim() : getDefaultClientId();
  let state = clientRuntimeStates.get(key);
  if (!state) {
    state = {
      handledSubGenMessageIds: new Set<string>(),
      dispatchingSubSessionIds: new Set<string>(),
    };
    clientRuntimeStates.set(key, state);
  }
  return state;
}

async function onSubAgentSessionFinished(subSession: Session): Promise<void> {
  const initialClientKey = subSession.tokenUuid || getDefaultClientId();
  if (getClientRuntimeState(initialClientKey).dispatchingSubSessionIds.has(subSession.id)) return;

  try {
    let clientId = subSession.tokenUuid || undefined;
    let genMessages = await getGenMessages(clientId);

    let parentGenMsg = [...genMessages]
      .reverse()
      .find((m) => m.subAgent?.subSessionId === subSession.id && m.subAgent.status === "running");

    if (!parentGenMsg) {
      const allClientIds = await getAllGenClientIds();
      for (const cid of allClientIds) {
        if (cid === (clientId || initialClientKey)) continue;
        const msgs = await getGenMessages(cid);
        const match = [...msgs]
          .reverse()
          .find((m) => m.subAgent?.subSessionId === subSession.id && m.subAgent.status === "running");
        if (match) {
          clientId = cid;
          genMessages = msgs;
          parentGenMsg = match;
          break;
        }
      }
    }

    if (!parentGenMsg || !parentGenMsg.subAgent) return;

    const runtimeState = getClientRuntimeState(clientId);
    if (runtimeState.dispatchingSubSessionIds.has(subSession.id)) return;

    const runMsgId = parentGenMsg.subAgent.messageId;
    if (!runMsgId) return;

    const subMessages = await getMessages(subSession.id);
    const runMsg = subMessages.find((m) => m.id === runMsgId);
    if (!runMsg) return;

    const returnMsg = [...subMessages]
      .reverse()
      .find((m) => m.type === "agent-return" && m.parentId === runMsg.id);
    if (!returnMsg) return;

    if (runtimeState.handledSubGenMessageIds.has(parentGenMsg.id)) return;
    runtimeState.handledSubGenMessageIds.add(parentGenMsg.id);

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
    }, clientId);

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
          const mem = await getGenMemory(clientId);
          const merged = Array.from(new Set([...mem.facts, ...res.object.memoryFactsToAdd])).slice(-30);
          await updateGenMemory({ facts: merged }, clientId);
        }
      } catch {
        replyContent = cleanOutput;
      }
    } else {
      replyContent = cleanOutput || "✅ The Sub Agent completed the task.";
    }

    const tokenUuid = parentGenMsg.tokenUuid || subSession.tokenUuid || clientId;
    await addGenMessage({
      role: "gen",
      content: replyContent,
      tokenUuid,
    }, clientId);

    const [updatedMessages, updatedMemory] = await Promise.all([
      getGenMessages(clientId),
      getGenMemory(clientId),
    ]);
    await compactGenMemoryIfNeeded(updatedMessages, updatedMemory, clientId);

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

export async function reconcileRunningGenSubAgents(targetClientId?: string | null): Promise<void> {
  ensureGenOrchestratorInitialized();
  const allKnownClientIds = await getAllGenClientIds();
  const clientIdsToReconcile = targetClientId
    ? [targetClientId]
    : (allKnownClientIds.length > 0 ? allKnownClientIds : [getDefaultClientId()]);

  for (const cid of clientIdsToReconcile) {
    const messages = await getGenMessages(cid);
    for (const msg of messages) {
      if (msg.subAgent?.status === "running") {
        const subSession = await getSession(msg.subAgent.subSessionId);
        if (subSession && (subSession.status === "done" || subSession.status === "error")) {
          await onSubAgentSessionFinished(subSession);
        }
      }
    }
  }
}

ensureGenOrchestratorInitialized();
