import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessions, getProjects, deleteSession, createSession, updateSession, addMessage, clearSessionLog } from "@/lib/store";
import { getAgent, AgentType, resolveAgentType, PROMPT_ENV_VAR } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";

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

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await getSessions();
  const projects = await getProjects();
  const projectIds = new Set(projects.map((p) => p.id));

  const valid: typeof sessions = [];
  for (const session of sessions) {
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
    if (!isAllowed) {
      continue;
    }

    if (session.projectId && !projectIds.has(session.projectId)) {
      console.log(`[sessions] project ${session.projectId} for session ${session.id} no longer exists, deleting session`);
      runnerManager.removeTasksForSession(session.id);
      await deleteSession(session.id);
      eventBus.publish({ type: "session_deleted", payload: { id: session.id } });
      continue;
    }
    valid.push(session);
  }

  return NextResponse.json(valid);
}

export async function POST(req: NextRequest) {
  const token = getArondoToken(req);
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

  const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
  if (!isAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const resolved = await resolveAgentType(agentType, run.info.agents);
  const resolvedType = resolved.agentType;
  const agent = getAgent(resolvedType);
  const fullPrompt = agent.buildPrompt(prompt);
  const command = agent.getCommand({ prompt, repoPath, sessionId: session.id, isResume: false, model: resolved.model });

  await updateSession(session.id, { command });
  session.command = command;

  const userMessage = await addMessage({ sessionId: session.id, role: "user", content: prompt, type: "chat-user" });
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
  eventBus.publish({ type: "session_updated", payload: session });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: session.id,
    messageId: systemMsg.id,
    type: "agent",
    createdAt: Date.now(),
    agentType: resolvedType,
  });

  await clearSessionLog(session.id, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.agent", {
      taskId,
      command,
      workDir: repoPath,
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

  return NextResponse.json(session, { status: 201 });
}

export const dynamic = "force-dynamic";
