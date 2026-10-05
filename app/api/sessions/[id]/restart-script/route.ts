import { NextRequest, NextResponse } from "next/server";
import { clearSessionLog, getMessages, getSession, updateMessage, updateSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

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
  const { command, messageId } = await req.json();
  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const messages = await getMessages(id);
  const runMessage = messages.find((message) => message.id === messageId && message.type === "script-run");
  if (!runMessage) {
    return NextResponse.json({ error: "Message is not a script run" }, { status: 400 });
  }
  const returnMessage = messages.find(
    (message) => message.parentId === messageId && message.type === "script-return" && !message.deleted,
  );
  if (returnMessage) {
    await Promise.all([
      updateMessage(id, returnMessage.id, { deleted: true }),
      updateMessage(id, messageId, { exitCode: undefined, stoppedByUser: false }),
      clearSessionLog(id, messageId, "script"),
    ]);
    const updatedSession = await updateSession(id, {
      status: "script-running",
      errorMessage: undefined,
    });
    eventBus.publish({ type: "session_updated", payload: updatedSession });
  }

  const ok = await runnerManager.restartTask(id, messageId, command, session.repoPath);
  if (!ok) {
    if (returnMessage) {
      await Promise.all([
        updateMessage(id, returnMessage.id, { deleted: false }),
        updateSession(id, { status: "error", errorMessage: returnMessage.content }),
      ]);
    }
    return NextResponse.json({ error: "Task not found or runner unavailable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
