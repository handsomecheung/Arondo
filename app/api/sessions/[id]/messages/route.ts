import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, addMessage, clearSessionLog, getMessages } from "@/lib/store";
import { getAgent, AgentType, resolveAgentType, PROMPT_ENV_VAR } from "@/lib/agents";
import { buildCrossAgentContext } from "@/lib/autoselect";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";

const MAX_SESSION_NAME_LENGTH = 80;

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
    return NextResponse.json({ error: "Agent is already running for this session" }, { status: 400 });
  }

  const { message, type } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trimmedMessage = message.trim();

  try {
    const messages = await getMessages(id);

    const userMsg = await addMessage({
      sessionId: id,
      role: "user",
      content: trimmedMessage,
      type: type || "chat-user",
    });
    eventBus.publish({ type: "message_added", payload: userMsg });
    const runnerConn = runnerManager.getRunner(session.runnerId);
    const resolved = await resolveAgentType(session.agentType, runnerConn?.info.agents ?? []);
    const resolvedType = resolved.agentType;

    // Detect an agent switch by comparing with the last known resolved agent type.
    const lastAgentRun = [...messages].reverse().find((m) => m.type === "agent-run" && m.resolvedAgentType);
    const prevResolvedType = lastAgentRun?.resolvedAgentType;
    const isAgentSwitch = !!prevResolvedType && prevResolvedType !== resolvedType;

    // When switching agents, only resume if this agent type has run before in this session.
    // Otherwise use the simple "any prior run" check for backward compatibility.
    const isResume = isAgentSwitch
      ? messages.some((m) => m.type === "agent-run" && m.resolvedAgentType === resolvedType)
      : messages.some((m) => m.type === "agent-run");

    // On agent switch, prepend the previous agent's conversation as context.
    let effectivePrompt = trimmedMessage;
    if (isAgentSwitch) {
      const ctx = await buildCrossAgentContext(id, resolvedType, messages);
      if (ctx) effectivePrompt = `${ctx}\n\n${trimmedMessage}`;
    }

    const agent = getAgent(resolvedType);
    const fullPrompt = agent.buildPrompt(effectivePrompt);
    const command = agent.getCommand({
      prompt: effectivePrompt,
      repoPath: session.repoPath,
      sessionId: id,
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
    const updatedSession = await updateSession(id, patch);
    eventBus.publish({ type: "session_updated", payload: updatedSession });

    const systemMsg = await addMessage({
      sessionId: id,
      role: "system",
      content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
      type: "agent-run",
      resolvedAgentType: resolvedType,
      prompt: fullPrompt,
    });
    eventBus.publish({ type: "message_added", payload: systemMsg });

    const runnerId = runnerManager.resolveRunnerId(session.runnerId);
    if (!runnerId) {
      return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
    }

    const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
    runnerManager.registerTask({
      taskId,
      runnerId,
      sessionId: id,
      messageId: systemMsg.id,
      type: "agent",
      createdAt: Date.now(),
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

    return NextResponse.json({ success: true, message: userMsg });
  } catch (error: any) {
    console.error("Failed to append follow-up message:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
