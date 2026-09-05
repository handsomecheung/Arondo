import { NextRequest, NextResponse } from "next/server";
import { getSession, getMessages, addMessage, updateSession, clearSessionLog, appendAutomodelLog } from "@/lib/store";
import { getAgent, resolveAgentType, PROMPT_ENV_VAR } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);

  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "running") {
    return NextResponse.json({ error: "Agent is already running" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { messageId } = body;
  if (!messageId || typeof messageId !== "string" || !messageId.trim()) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const messages = await getMessages(id);
  const targetMsgIndex = messages.findIndex((m) => m.id === messageId);
  if (targetMsgIndex === -1) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const targetMsg = messages[targetMsgIndex];
  if (targetMsg.type !== "agent-run") {
    return NextResponse.json({ error: "Message is not an agent run" }, { status: 400 });
  }

  const returnMsg = messages.find(
    (m) => m.parentId === targetMsg.id && (m.type === "agent-return" || m.type === "detached-agent-return")
  );
  if (!returnMsg) {
    return NextResponse.json({ error: "Agent is still running or has not completed" }, { status: 400 });
  }

  const isSuccess = returnMsg.content.startsWith("✅");
  const isStopped = returnMsg.content.startsWith("🛑");
  if (isSuccess) {
    return NextResponse.json({ error: "Only failed agent runs can be retried" }, { status: 400 });
  }
  if (isStopped) {
    return NextResponse.json({ error: "Stopped agent runs cannot be retried" }, { status: 400 });
  }

  let prompt = targetMsg.prompt;
  if (!prompt || !prompt.trim()) {
    const priorUserMessage = [...messages.slice(0, targetMsgIndex)].reverse().find(
      (m) => m.role === "user" && m.type !== "user-todo"
    );
    prompt = priorUserMessage?.prompt || priorUserMessage?.content;
  }
  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "Session has no prompt to re-run" }, { status: 400 });
  }

  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) {
    return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
  }

  const runnerConn = runnerManager.getRunner(runnerId);
  const systemMessageId = crypto.randomUUID();
  const resolved = await resolveAgentType(session.agentType, runnerConn?.info.agentBinaries ?? [], {
    prompt,
    automodelLog: (text) => appendAutomodelLog(id, systemMessageId, text),
  });
  const resolvedType = resolved.agentType;

  const priorRuns = messages.slice(0, targetMsgIndex).filter((m) => m.type === "agent-run" && m.resolvedAgentType);
  const lastPriorRun = priorRuns[priorRuns.length - 1];
  const prevResolvedType = lastPriorRun?.resolvedAgentType;
  const isAgentSwitch = !!prevResolvedType && prevResolvedType !== resolvedType;

  const isResume = isAgentSwitch
    ? priorRuns.some((m) => m.resolvedAgentType === resolvedType)
    : priorRuns.length > 0;

  const agent = getAgent(resolvedType);
  const fullPrompt = agent.buildPrompt(prompt);
  const command = agent.getCommand({
    prompt,
    repoPath: session.repoPath,
    sessionId: session.id,
    isResume,
    model: resolved.model,
    effort: resolved.effort,
  });

  const updatedSession = await updateSession(id, { status: "running", errorMessage: undefined });

  const systemMsg = await addMessage({
    id: systemMessageId,
    sessionId: id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "agent-run",
    command,
    resolvedAgentType: resolvedType,
    resolvedAgyQuotaGroup: resolved.agyQuotaGroup,
    prompt: fullPrompt,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: id,
    messageId: systemMsg.id,
    type: "agent",
    createdAt: Date.now(),
    agentType: resolvedType,
    command,
  });

  await clearSessionLog(id, systemMsg.id);

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
      const updated = await updateSession(id, { status: "error", errorMessage });
      const errMsg = await addMessage({
        sessionId: id,
        role: "system",
        content: `❌ Failed to start agent: ${errorMessage}`,
        type: "agent-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return NextResponse.json({ success: true, messageId: systemMsg.id });
}

export const dynamic = "force-dynamic";
