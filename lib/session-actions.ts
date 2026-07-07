import {
  getSession,
  updateSession,
  addMessage,
  clearSessionLog,
  getMessages,
  getProjectScripts,
} from "./store";
import { getAgent, resolveAgentType, PROMPT_ENV_VAR } from "./agents";
import { buildCrossAgentContext } from "./autoselect";
import { eventBus } from "./event-bus";
import { runnerManager } from "./runner-manager";

const MAX_SESSION_NAME_LENGTH = 80;

export type ActionResult = { ok: true; [key: string]: any } | { ok: false; error: string; status: number };

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

  const userMsg = await addMessage({
    sessionId,
    role: "user",
    content: trimmedMessage,
    prompt: trimmedPrompt || undefined,
    type: (opts.type as any) || "chat-user",
    tokenUuid: opts.tokenUuid,
  });
  eventBus.publish({ type: "message_added", payload: userMsg });

  const runnerConn = runnerManager.getRunner(session.runnerId);
  const resolved = await resolveAgentType(session.agentType, runnerConn?.info.agents ?? []);
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
  });

  const patch: Record<string, any> = { status: "running", command };
  if (!session.prompt) {
    if (!session.name) {
      const firstLine = trimmedMessage.split("\n")[0];
      patch.name = firstLine.length > MAX_SESSION_NAME_LENGTH
        ? firstLine.slice(0, MAX_SESSION_NAME_LENGTH) + "…"
        : firstLine;
    }
    patch.prompt = trimmedMessage;
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
  });

  await clearSessionLog(sessionId, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.agent", {
      taskId,
      command,
      workDir: session.repoPath,
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
  if (session.status === "running") {
    return { ok: false, error: "Agent is already running for this session", status: 400 };
  }

  const runningScripts = session.runningScripts || [];

  const scripts = await getProjectScripts(session.projectId);
  const script = scripts.find((s) => s.name === scriptName) ?? { name: scriptName, command: scriptName };

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
    status: "script-running",
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
      const nextStatus = nextRunning.length > 0 ? "script-running" : "error";
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
