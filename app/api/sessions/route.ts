import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessions, createSession, updateSession, addMessage, clearSessionLog } from "@/lib/store";
import { getAgent, AgentType } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";

const MAX_SESSION_NAME_LENGTH = 80;

function deriveSessionName(prompt: string, repoPath: string): string {
  if (prompt && prompt.trim()) {
    const firstLine = prompt.trim().split("\n")[0];
    if (firstLine.length > MAX_SESSION_NAME_LENGTH) {
      return firstLine.slice(0, MAX_SESSION_NAME_LENGTH) + "…";
    }
    return firstLine;
  }
  return path.basename(repoPath) || "Untitled";
}

export async function GET() {
  const sessions = await getSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, repoPath, agentType = "antigravity", runnerId, name } = body as {
    prompt: string;
    repoPath: string;
    agentType?: string;
    runnerId: string;
    name?: string;
  };

  const isBlank = !prompt || !prompt.trim();

  if (!repoPath) {
    return NextResponse.json({ error: "repoPath is required" }, { status: 400 });
  }
  if (!runnerId) {
    return NextResponse.json({ error: "runnerId is required" }, { status: 400 });
  }

  const run = runnerManager.getRunner(runnerId);
  if (!run) {
    return NextResponse.json({ error: "Runner not found or disconnected" }, { status: 400 });
  }

  if (isBlank) {
    const session = await createSession({
      status: "idle",
      prompt: "",
      name: name?.trim() || deriveSessionName("", repoPath),
      agentType,
      repoPath,
      runnerId,
    });
    eventBus.publish({ type: "session_updated", payload: session });
    return NextResponse.json(session, { status: 201 });
  }

  const session = await createSession({
    status: "running",
    prompt,
    name: name?.trim() || deriveSessionName(prompt, repoPath),
    agentType,
    repoPath,
    runnerId,
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

  // Run agent via runner
  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: session.id,
    messageId: systemMsg.id,
    type: "agent",
    createdAt: Date.now(),
  });

  await clearSessionLog(session.id, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.agent", {
      taskId,
      command,
      workDir: repoPath,
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

  return NextResponse.json(session, { status: 201 });
}

export const dynamic = "force-dynamic";
