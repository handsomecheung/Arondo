import { NextRequest, NextResponse } from "next/server";
import { getSession, addMessage, updateSession, clearSessionLog } from "@/lib/store";
import { getAgent, AgentType, resolveAgentType, PROMPT_ENV_VAR } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "running") {
    return NextResponse.json({ error: "Agent is already running" }, { status: 400 });
  }

  if (!session.prompt) {
    return NextResponse.json({ error: "Session has no prompt to re-run" }, { status: 400 });
  }

  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) {
    return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
  }

  const runnerConn = runnerManager.getRunner(runnerId);
  const resolved = await resolveAgentType(session.agentType, runnerConn?.info.agents ?? []);
  const resolvedType = resolved.agentType;
  const agent = getAgent(resolvedType);
  const fullPrompt = agent.buildPrompt(session.prompt);
  const command = agent.getCommand({
    prompt: session.prompt,
    repoPath: session.repoPath,
    sessionId: session.id,
    isResume: false,
    model: resolved.model,
  });

  const updatedSession = await updateSession(id, { status: "running", command, errorMessage: undefined });

  const systemMsg = await addMessage({
    sessionId: id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "agent-run",
    resolvedAgentType: resolvedType,
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
  });

  await clearSessionLog(id, systemMsg.id);

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
