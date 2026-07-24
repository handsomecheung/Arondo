import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessions, getProjects, deleteSession, archiveSession, createSession, addTodoMessage, getSession, getSessionArchiveAgeMs } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken, getUuidByToken } from "@/lib/auth";
import { dispatchCreateSession } from "@/lib/session-actions";
import { getProjectReadiness } from "@/lib/project-readiness";

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
  const sessionArchiveAgeMs = await getSessionArchiveAgeMs();

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

    const isActive = session.status === "running" || session.status === "script-running";
    const isStale = Date.now() - new Date(session.updatedAt).getTime() > sessionArchiveAgeMs;
    if (!isActive && isStale && session.archivedManually !== false) {
      console.log(`[sessions] session ${session.id} last updated over ${sessionArchiveAgeMs / (24 * 60 * 60 * 1000)} days ago, archiving`);
      await archiveSession(session.id);
      eventBus.publish({ type: "session_deleted", payload: { id: session.id } });
      continue;
    }

    valid.push(session);
  }

  return NextResponse.json(valid);
}

async function pickRandomAllowedRunnerId(token: string | null): Promise<string | undefined> {
  const connected = runnerManager.getRunners();
  const allowed: string[] = [];
  for (const r of connected) {
    if (await runnerManager.isTokenAllowedForRunnerId(r.id, token)) {
      allowed.push(r.id);
    }
  }
  if (allowed.length === 0) return undefined;
  return allowed[Math.floor(Math.random() * allowed.length)];
}

export async function POST(req: NextRequest) {
  const token = getArondoToken(req);
  const body = await req.json();
  const { prompt, message, repoPath: repoPathInput, tempDir, agentType = "auto", runnerId: runnerIdInput, name, isDraft, draftTrigger = "codebaseReady", force } = body as {
    prompt: string;
    message?: string;
    repoPath?: string;
    tempDir?: boolean;
    agentType?: string;
    runnerId?: string;
    name?: string;
    isDraft?: boolean;
    draftTrigger?: "manual" | "codebaseReady";
    force?: boolean;
  };

  const isBlank = !prompt || !prompt.trim();

  if (tempDir && repoPathInput) {
    return NextResponse.json({ error: "repoPath must not be provided when tempDir is set" }, { status: 400 });
  }
  if (!tempDir && !repoPathInput) {
    return NextResponse.json({ error: "repoPath is required" }, { status: 400 });
  }

  let runnerId = runnerIdInput;
  if (!runnerId) {
    if (!tempDir) {
      return NextResponse.json({ error: "runnerId is required" }, { status: 400 });
    }
    runnerId = await pickRandomAllowedRunnerId(token);
    if (!runnerId) {
      return NextResponse.json({ error: "No available runners" }, { status: 400 });
    }
  }

  const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
  if (!isAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const run = runnerManager.getRunner(runnerId);
  if (!run) {
    return NextResponse.json({ error: "Runner not found or disconnected" }, { status: 400 });
  }

  let repoPath = repoPathInput as string;
  if (tempDir) {
    try {
      const result = await runnerManager.sendRequest(runnerId, "fs.mkdtemp", {});
      repoPath = result.path;
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Failed to create temp directory" }, { status: 500 });
    }
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
    const trimmedMessage = message?.trim() || trimmedPrompt;
    const session = await createSession({
      status: "idle",
      prompt: "",
      name: name?.trim() || deriveSessionName(trimmedMessage, repoPath),
      agentType,
      repoPath,
      runnerId,
    });
    const todoMessage = await addTodoMessage(session.id, {
      content: trimmedMessage,
      prompt: trimmedPrompt,
      trigger: { kind: draftTrigger === "manual" ? "manual" : "codebaseReady" },
      tokenUuid: getUuidByToken(token) || undefined,
    });
    const updated = (await getSession(session.id)) || session;
    eventBus.publish({ type: "message_added", payload: todoMessage });
    eventBus.publish({ type: "session_updated", payload: updated });
    return NextResponse.json(updated, { status: 201 });
  }

  if (!force) {
    const { dirty, busy } = await getProjectReadiness(runnerId, repoPath);
    if (dirty || busy) {
      return NextResponse.json({ needsConfirmation: true, reason: { dirty, busy } }, { status: 409 });
    }
  }

  const result = await dispatchCreateSession(runnerId, repoPath, agentType, prompt, {
    name,
    tokenUuid: getUuidByToken(token) || undefined,
    displayMessage: message,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.session, { status: 201 });
}

export const dynamic = "force-dynamic";
