import { NextRequest, NextResponse } from "next/server";
import { getSession, getMessages, markMessageDeleted } from "@/lib/store";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

// Mark a message as deleted in messages.json without physically removing it.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const { id, messageId } = await params;
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = await getMessages(id);
  const targetMsg = messages.find((m) => m.id === messageId);
  if (!targetMsg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Prevent deleting running scripts
  if (targetMsg.type === "script-run") {
    const hasReturn = messages.some((m) => m.parentId === targetMsg.id);
    if (!hasReturn && (session.status === "script-running" || session.status === "running")) {
      return NextResponse.json({ error: "Cannot delete a running script" }, { status: 400 });
    }
  }

  const updatedMessages = await markMessageDeleted(id, messageId);
  for (const updated of updatedMessages) {
    eventBus.publish({ type: "message_updated", payload: updated });
  }

  return NextResponse.json({ success: true, count: updatedMessages.length });
}

export const dynamic = "force-dynamic";
