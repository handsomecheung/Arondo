import { NextRequest, NextResponse } from "next/server";
import { dispatchFollowupMessage } from "@/lib/session-actions";
import { getSession, getMessages, isSessionArchived } from "@/lib/store";
import { getArondoToken, verifySessionPermission, getUuidByToken } from "@/lib/auth";
import { getProjectReadiness } from "@/lib/project-readiness";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isSessionArchived(id)) {
    return NextResponse.json({ error: "Session is archived. Unarchive it to send messages." }, { status: 403 });
  }

  const { message, type, prompt, force } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!force) {
    const session = await getSession(id);
    if (session) {
      // "First message" means nothing has ever been added to this session yet —
      // not just "has an agent run", since a session can already carry queued
      // (pending) todo messages before its first real dispatch.
      const existingMessages = await getMessages(id);
      const isFirstMessage = existingMessages.length === 0;
      if (isFirstMessage) {
        // The first message on a freshly created (empty) session hasn't gone through
        // the codebase-readiness check new sessions get in POST /api/sessions — apply
        // the same confirmation gate here so behavior is consistent either way.
        const { dirty, busy } = await getProjectReadiness(session.runnerId, session.repoPath);
        if (dirty || busy) {
          return NextResponse.json({ needsConfirmation: true, reason: { dirty, busy, isFollowup: false } }, { status: 409 });
        }
      } else {
        // Follow-up message: only this session's own running state matters —
        // codebase cleanliness and other sessions on the same repo don't block it.
        // A message can't jump ahead of todos already queued on this session either.
        const busy = session.status === "running" || session.status === "script-running";
        const queued = !!(session.pendingTodoMessageIds && session.pendingTodoMessageIds.length > 0);
        if (busy || queued) {
          return NextResponse.json({ needsConfirmation: true, reason: { dirty: false, busy, queued, isFollowup: true } }, { status: 409 });
        }
      }
    }
  }

  try {
    const result = await dispatchFollowupMessage(id, message, {
      prompt,
      type,
      tokenUuid: getUuidByToken(token) || undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error("Failed to append follow-up message:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
