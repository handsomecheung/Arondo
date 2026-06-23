import { NextRequest, NextResponse } from "next/server";
import { getSessions, createSession, updateSession, addMessage, clearSessionLog } from "@/lib/store";
import { getAgent, AgentType } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import { controllerManager } from "@/lib/controller-manager";

export async function GET() {
  const sessions = await getSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, repoPath, agentType = "antigravity", controllerId } = body as {
    prompt: string;
    repoPath: string;
    agentType?: string;
    controllerId: string;
  };

  if (!prompt || !repoPath) {
    return NextResponse.json({ error: "prompt and repoPath are required" }, { status: 400 });
  }
  if (!controllerId) {
    return NextResponse.json({ error: "controllerId is required" }, { status: 400 });
  }

  const ctrl = controllerManager.getController(controllerId);
  if (!ctrl) {
    return NextResponse.json({ error: "Controller not found or disconnected" }, { status: 400 });
  }

  const session = await createSession({
    status: "running",
    prompt,
    agentType,
    repoPath,
    controllerId,
  });

  const agent = getAgent(agentType as AgentType);
  const command = agent.getCommand({ prompt, repoPath, sessionId: session.id, isResume: false });

  await updateSession(session.id, { command });
  session.command = command;

  const userMessage = await addMessage({ sessionId: session.id, role: "user", content: prompt, type: "chat-user" });
  eventBus.publish({ type: "message_added", payload: userMessage });

  const systemMsg = await addMessage({
    sessionId: session.id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    type: "agent-run",
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });
  eventBus.publish({ type: "session_updated", payload: session });

  // Run agent via controller
  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  controllerManager.registerTask({
    taskId,
    controllerId,
    sessionId: session.id,
    messageId: systemMsg.id,
    type: "agent",
  });

  await clearSessionLog(session.id, systemMsg.id);

  controllerManager
    .sendRequest(controllerId, "exec.agent", {
      taskId,
      command,
      workDir: repoPath,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) controllerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const updated = await updateSession(session.id, { status: "error", errorMessage });
      const errMsg = await addMessage({
        sessionId: session.id,
        role: "system",
        content: `❌ Failed to start agent: ${errorMessage}`,
        type: "agent-return",
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return NextResponse.json(session, { status: 201 });
}

export const dynamic = "force-dynamic";
