import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessions, getProjects, deleteSession, createSession, addScheduledTask } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken, getUuidByToken } from "@/lib/auth";
import { dispatchCreateSession } from "@/lib/session-actions";

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
  const { prompt, repoPath, agentType = "antigravity", runnerId, name, isDraft } = body as {
    prompt: string;
    repoPath: string;
    agentType?: string;
    runnerId: string;
    name?: string;
    isDraft?: boolean;
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

  if (isDraft) {
    const trimmedPrompt = prompt.trim();
    const session = await createSession({
      status: "draft",
      prompt: trimmedPrompt,
      name: name?.trim() || deriveSessionName(trimmedPrompt, repoPath),
      agentType,
      repoPath,
      runnerId,
    });
    await addScheduledTask({
      trigger: { kind: "codebaseReady", runnerId, repoPath },
      action: { kind: "sendMessage", sessionId: session.id, message: trimmedPrompt },
      tokenUuid: getUuidByToken(token) || undefined,
    });
    eventBus.publish({ type: "session_updated", payload: session });
    return NextResponse.json(session, { status: 201 });
  }

  const result = await dispatchCreateSession(runnerId, repoPath, agentType, prompt, {
    name,
    tokenUuid: getUuidByToken(token) || undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.session, { status: 201 });
}

export const dynamic = "force-dynamic";
