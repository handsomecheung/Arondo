import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, addMessage, clearSessionLog } from "@/lib/store";
import { getAgent, AgentType } from "@/lib/agents";
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
    return NextResponse.json({ error: "Agent is already running for this session" }, { status: 400 });
  }

  const { message, type } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trimmedMessage = message.trim();

  try {
    const userMsg = await addMessage({
      sessionId: id,
      role: "user",
      content: trimmedMessage,
      type: type || "chat-user",
    });
    eventBus.publish({ type: "message_added", payload: userMsg });

    const agent = getAgent(session.agentType as AgentType);
    const command = agent.getCommand({ prompt: trimmedMessage, repoPath: session.repoPath, sessionId: id, isResume: true });

    const updatedSession = await updateSession(id, { status: "running", command });
    eventBus.publish({ type: "session_updated", payload: updatedSession });

    const systemMsg = await addMessage({
      sessionId: id,
      role: "system",
      content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
      type: "agent-run",
    });
    eventBus.publish({ type: "message_added", payload: systemMsg });

    // Run agent via runner
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
    });

    await clearSessionLog(id, systemMsg.id);

    runnerManager
      .sendRequest(runnerId, "exec.agent", {
        taskId,
        command,
        workDir: session.repoPath,
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
