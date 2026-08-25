import path from "path";
import {
  getSession,
  createSession,
  updateSession,
  addMessage,
  clearSessionLog,
  getMessages,
  getProjectScripts,
  recordScriptHistory,
  getSessionLog,
  type DetachedAgentKind,
} from "./store";
import { getAgent, resolveAgentType, PROMPT_ENV_VAR } from "./agents";
import { buildCrossAgentContext } from "./autoselect";
import { eventBus } from "./event-bus";
import { runnerManager } from "./runner-manager";
import { readTokensConfig } from "./auth";
import { isQuotaErrorMessage } from "./agent-quota-errors";
import { stripAnsi } from "./ansi";

const MAX_SESSION_NAME_LENGTH = 80;

export type ActionResult = { ok: true; [key: string]: any } | { ok: false; error: string; status: number };

const DETACHED_CONTEXT_MAX_CHARS = 48_000;

export async function buildDetachedAgentContext(sessionId: string): Promise<string> {
  const messages = await getMessages(sessionId);
  const parts: string[] = [];

  for (const message of messages) {
    if (message.type === "detached-agent-run" || message.type === "detached-agent-return") continue;
    if (message.type === "chat-user") {
      parts.push(`User:\n${message.content}`);
      continue;
    }
    if (message.type === "agent-run") {
      const output = stripAnsi(await getSessionLog(sessionId, message.id)).trim();
      if (output) parts.push(`Agent (${message.resolvedAgentType || "unknown"}):\n${output}`);
    }
  }

  const context = parts.join("\n\n---\n\n");
  return context.length > DETACHED_CONTEXT_MAX_CHARS
    ? `[Earlier session context omitted to stay within the context limit.]\n\n${context.slice(-DETACHED_CONTEXT_MAX_CHARS)}`
    : context;
}

export async function dispatchDetachedAgent(
  sessionId: string,
  kind: DetachedAgentKind,
  message: string,
  agentType?: string,
): Promise<ActionResult> {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Session not found", status: 404 };

  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) return { ok: false, error: "No connected runner available", status: 503 };

  const context = await buildDetachedAgentContext(sessionId);
  const trimmedMessage = message.trim();
  const instructions = kind === "review"
    ? "Review the current working tree for correctness, regressions, security issues, and missing tests. Use git diff to inspect changes. Do not modify files. Report findings in severity order with file and line references when possible. If there are no findings, say so clearly."
    : "Answer the user's request using the supplied session context. This is an independent side conversation: do not modify files and do not assume your answer changes the parent session's plan.";
  const prompt = [
    "You are an independent agent. The following is context copied from a parent Arondo session.",
    "Do not continue or alter the parent agent conversation.",
    "<parent-session-context>",
    context || "(The parent session has no normal conversation history yet.)",
    "</parent-session-context>",
    "",
    instructions,
    trimmedMessage ? `\nUser request:\n${trimmedMessage}` : "",
  ].join("\n");

  const runner = runnerManager.getRunner(runnerId);
  const selectedAgentType = agentType || session.agentType;
  const resolved = await resolveAgentType(selectedAgentType, runner?.info.agents ?? [], { prompt });

  const agentSessionKey = crypto.randomUUID();
  const agent = getAgent(resolved.agentType);
  const fullPrompt = agent.buildPrompt(prompt);
  const command = agent.getCommand({
    prompt,
    repoPath: session.repoPath,
    sessionId: agentSessionKey,
    isResume: false,
    model: resolved.model,
    effort: resolved.effort,
  });

  const runMessage = await addMessage({
    sessionId,
    role: "system",
    content: `⚙️ ${kind === "review" ? "Review" : "By the way"} · Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "detached-agent-run",
    resolvedAgentType: resolved.agentType,
    prompt: fullPrompt,
    detachedKind: kind,
    agentSessionKey,
  });
  eventBus.publish({ type: "message_added", payload: runMessage });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  await runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId,
    messageId: runMessage.id,
    type: "detached-agent",
    createdAt: Date.now(),
    agentType: resolved.agentType,
    command,
    detachedKind: kind,
  });
  await clearSessionLog(sessionId, runMessage.id);

  runnerManager.sendRequest(runnerId, "exec.agent", {
    taskId,
    command,
    workDir: session.repoPath,
    agentType: resolved.agentType,
    prompt: fullPrompt,
    promptEnvVar: PROMPT_ENV_VAR,
  }, 10_000).then((res: any) => {
    if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
  }).catch(async (err) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorMessageRecord = await addMessage({
      sessionId,
      role: "system",
      content: `❌ Failed to start agent: ${errorMessage}`,
      type: "detached-agent-return",
      parentId: runMessage.id,
      detachedKind: kind,
    });
    eventBus.publish({ type: "message_added", payload: errorMessageRecord });
  });

  return { ok: true, messageId: runMessage.id };
}

/**
 * Starts (or resumes) the agent for a session with a follow-up message.
 * Shared by the /messages API route and the scheduler (afterSession / quotaAvailable triggers).
 */
export async function dispatchFollowupMessage(
  sessionId: string,
  message: string,
  opts: { prompt?: string; type?: string; tokenUuid?: string } = {},
): Promise<ActionResult> {
  const session = await getSession(sessionId);
  if (!session) {
    return { ok: false, error: "Session not found", status: 404 };
  }
  if (session.status === "running") {
    return { ok: false, error: "Agent is already running for this session", status: 400 };
  }

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return { ok: false, error: "message is required", status: 400 };
  }
  const trimmedPrompt = opts.prompt?.trim();

  const messages = await getMessages(sessionId);

  // Resolve user name and color from token config
  let userName: string | undefined;
  let userColor: string | undefined;
  if (opts.tokenUuid) {
    try {
      const authConfig = await readTokensConfig();
      const client = authConfig.clients.find(c => c.uuid === opts.tokenUuid);
      if (client) {
        userName = client.name;
        userColor = client.color;
      }
    } catch (err) {
      console.error("Failed to resolve user color/name for message:", err);
    }
  }

  const userMsg = await addMessage({
    sessionId,
    role: "user",
    content: trimmedMessage,
    prompt: trimmedPrompt || undefined,
    type: (opts.type as any) || "chat-user",
    tokenUuid: opts.tokenUuid,
    userName,
    userColor,
  });
  eventBus.publish({ type: "message_added", payload: userMsg });

  const runnerConn = runnerManager.getRunner(session.runnerId);

  const prevQuotaError = session.agentType === "auto" &&
    session.errorMessage != null &&
    isQuotaErrorMessage(session.errorMessage);

  const resolved = await resolveAgentType(session.agentType, runnerConn?.info.agents ?? [], { prompt: trimmedPrompt || trimmedMessage });
  const resolvedType = resolved.agentType;

  const lastAgentRun = [...messages].reverse().find((m) => m.type === "agent-run" && m.resolvedAgentType);
  const prevResolvedType = lastAgentRun?.resolvedAgentType;
  const isAgentSwitch = !!prevResolvedType && prevResolvedType !== resolvedType;

  const isResume = isAgentSwitch
    ? messages.some((m) => m.type === "agent-run" && m.resolvedAgentType === resolvedType)
    : messages.some((m) => m.type === "agent-run");

  let effectivePrompt = trimmedPrompt || trimmedMessage;
  if (isAgentSwitch) {
    const ctx = await buildCrossAgentContext(sessionId, resolvedType, messages);
    if (ctx) effectivePrompt = `${ctx}\n\n${effectivePrompt}`;
  }

  const agent = getAgent(resolvedType);
  const fullPrompt = agent.buildPrompt(effectivePrompt);
  const command = agent.getCommand({
    prompt: effectivePrompt,
    repoPath: session.repoPath,
    sessionId,
    isResume,
    model: resolved.model,
    effort: resolved.effort,
  });

  const patch: Record<string, any> = { status: "running" };
  if (!session.name) {
    const firstLine = trimmedMessage.split("\n")[0];
    patch.name = firstLine.length > MAX_SESSION_NAME_LENGTH
      ? firstLine.slice(0, MAX_SESSION_NAME_LENGTH) + "…"
      : firstLine;
  }
  if (session.agentType === "auto") {
    patch.autoLockedAgentType = resolvedType;
    patch.autoLockedAgentModel = resolved.model ?? undefined;
    patch.autoLockedAgentEffort = resolved.effort ?? undefined;
    if (prevQuotaError) {
      patch.errorMessage = undefined;
    }
  }
  const updatedSession = await updateSession(sessionId, patch);
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  const systemMsg = await addMessage({
    sessionId,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "agent-run",
    resolvedAgentType: resolvedType,
    prompt: fullPrompt,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) {
    return { ok: false, error: "No connected runner available", status: 503 };
  }

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  await runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId,
    messageId: systemMsg.id,
    type: "agent",
    createdAt: Date.now(),
    agentType: resolvedType,
    command,
  });

  await clearSessionLog(sessionId, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.agent", {
      taskId,
      command,
      workDir: session.repoPath,
      agentType: resolvedType,
      prompt: fullPrompt,
      promptEnvVar: PROMPT_ENV_VAR,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const updated = await updateSession(sessionId, { status: "error", errorMessage });
      const errMsg = await addMessage({
        sessionId,
        role: "system",
        content: `❌ Failed to start agent: ${errorMessage}`,
        type: "agent-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return { ok: true, message: userMsg };
}

function deriveSessionName(prompt: string, repoPath: string): string {
  if (prompt && prompt.trim()) {
    const firstLine = prompt.trim().split("\n")[0];
    return firstLine.length > MAX_SESSION_NAME_LENGTH
      ? firstLine.slice(0, MAX_SESSION_NAME_LENGTH) + "…"
      : firstLine;
  }
  return path.basename(repoPath) || "Untitled";
}

/**
 * Creates a brand-new session and immediately starts the agent.
 * Shared by the /sessions API route (POST, non-blank prompt) and the
 * scheduler (draft's codebaseReady trigger).
 */
export async function dispatchCreateSession(
  runnerId: string,
  repoPath: string,
  agentType: string,
  prompt: string,
  opts: { name?: string; tokenUuid?: string; displayMessage?: string; tempDir?: boolean } = {},
): Promise<ActionResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return { ok: false, error: "prompt is required", status: 400 };
  }
  const displayMessage = opts.displayMessage?.trim() || trimmedPrompt;

  const run = runnerManager.getRunner(runnerId);
  if (!run) {
    return { ok: false, error: "Runner not found or disconnected", status: 503 };
  }

  const session = await createSession({
    status: "running",
    name: opts.name?.trim() || deriveSessionName(displayMessage, repoPath),
    agentType,
    repoPath,
    runnerId,
  }, { tempDir: opts.tempDir });

  const resolved = await resolveAgentType(agentType, run.info.agents, { prompt: trimmedPrompt });
  const resolvedType = resolved.agentType;
  const agent = getAgent(resolvedType);
  const fullPrompt = agent.buildPrompt(trimmedPrompt);
  const command = agent.getCommand({
    prompt: trimmedPrompt,
    repoPath,
    sessionId: session.id,
    isResume: false,
    model: resolved.model,
    effort: resolved.effort,
  });

  const autoLockPatch = agentType === "auto"
    ? {
      autoLockedAgentType: resolvedType,
      autoLockedAgentModel: resolved.model ?? undefined,
      autoLockedAgentEffort: resolved.effort ?? undefined,
    }
    : {};
  const updatedSession = await updateSession(session.id, autoLockPatch);
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  const userMessage = await addMessage({
    sessionId: session.id,
    role: "user",
    content: displayMessage,
    prompt: trimmedPrompt,
    type: "chat-user",
    tokenUuid: opts.tokenUuid,
  });
  eventBus.publish({ type: "message_added", payload: userMessage });

  const systemMsg = await addMessage({
    sessionId: session.id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "agent-run",
    resolvedAgentType: resolvedType,
    prompt: fullPrompt,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  await runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: session.id,
    messageId: systemMsg.id,
    type: "agent",
    createdAt: Date.now(),
    agentType: resolvedType,
    command,
  });

  await clearSessionLog(session.id, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.agent", {
      taskId,
      command,
      workDir: repoPath,
      agentType: resolvedType,
      prompt: fullPrompt,
      promptEnvVar: PROMPT_ENV_VAR,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const updated = await updateSession(session.id, { status: "error", errorMessage });
      const errMsg = await addMessage({
        sessionId: session.id,
        role: "system",
        content: `❌ Failed to start agent: ${errorMessage}`,
        type: "agent-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return { ok: true, session: updatedSession, messageId: systemMsg.id };
}

/**
 * Runs a project script inside a session's context.
 * Shared by the /run-script API route and the scheduler ('at' trigger).
 */
export async function dispatchSessionScript(
  sessionId: string,
  scriptName: string,
  opts: { prompt?: string; tokenUuid?: string } = {},
): Promise<ActionResult> {
  const session = await getSession(sessionId);
  if (!session) {
    return { ok: false, error: "Session not found", status: 404 };
  }

  const runningScripts = session.runningScripts || [];

  const scripts = await getProjectScripts(session.projectId);
  const script = scripts.find((s) => s.name === scriptName) ?? { name: scriptName, command: scriptName };

  if (opts.prompt?.startsWith("!")) {
    await recordScriptHistory(session.projectId, script.command);
  }

  const systemMsg = await addMessage({
    sessionId,
    role: "system",
    content: `⚙️ Running script: **${script.name}**\n\`\`\`bash\n${script.command}\n\`\`\``,
    type: "script-run",
    prompt: opts.prompt,
    tokenUuid: opts.tokenUuid,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const updatedSession = await updateSession(sessionId, {
    status: session.status === "running" ? "running" : "script-running",
    runningScripts: [...runningScripts, scriptName],
  });
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) {
    return { ok: false, error: "No connected runner available", status: 503 };
  }

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId,
    messageId: systemMsg.id,
    type: "script",
    scriptName,
    createdAt: Date.now(),
  });

  await clearSessionLog(sessionId, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.script", {
      taskId,
      command: script.command,
      workDir: session.repoPath,
      cols: 120,
      rows: 30,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const removeIdx = runningScripts.indexOf(scriptName);
      const nextRunning = removeIdx >= 0
        ? [...runningScripts.slice(0, removeIdx), ...runningScripts.slice(removeIdx + 1)]
        : [...runningScripts];
      const hasAgentTask = runnerManager.getAllTasks().some(
        (t) => t.sessionId === sessionId && t.type === "agent" && !t.completedAt,
      );
      const nextStatus = hasAgentTask ? "running" : nextRunning.length > 0 ? "script-running" : "error";
      const updated = await updateSession(sessionId, {
        status: nextStatus as any,
        runningScripts: nextRunning,
        errorMessage,
      });
      const errMsg = await addMessage({
        sessionId,
        role: "system",
        content: `❌ Error: ${errorMessage}`,
        type: "script-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return { ok: true, messageId: systemMsg.id };
}
