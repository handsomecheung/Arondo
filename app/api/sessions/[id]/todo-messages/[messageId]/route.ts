import { NextRequest, NextResponse } from "next/server";
import { getSession, getMessages, resolveTodoMessage, changeTodoTrigger, type TodoTrigger } from "@/lib/store";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";
import { executeAction } from "@/lib/scheduler";

// Cancel / send-now / change-trigger actions on a pending todo message —
// the three-dot menu on UserTodoMessageCard.
export async function PATCH(
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
  const todo = messages.find((m) => m.id === messageId && m.type === "user-todo");
  if (!todo) {
    return NextResponse.json({ error: "Todo message not found" }, { status: 404 });
  }
  if (todo.todoStatus !== "pending") {
    return NextResponse.json({ error: "Only pending todo messages can be modified" }, { status: 400 });
  }

  const { action, trigger } = (await req.json()) as { action: "cancel" | "sendNow" | "changeTrigger"; trigger?: TodoTrigger };

  if (action === "cancel") {
    const updated = await resolveTodoMessage(id, messageId, { todoStatus: "cancelled" });
    eventBus.publish({ type: "message_updated", payload: updated });
    const updatedSession = await getSession(id);
    if (updatedSession) eventBus.publish({ type: "session_updated", payload: updatedSession });
    return NextResponse.json(updated);
  }

  if (action === "changeTrigger") {
    if (!trigger || !trigger.kind) {
      return NextResponse.json({ error: "trigger is required" }, { status: 400 });
    }
    const updated = await changeTodoTrigger(id, messageId, trigger);
    eventBus.publish({ type: "message_updated", payload: updated });
    const updatedSession = await getSession(id);
    if (updatedSession) eventBus.publish({ type: "session_updated", payload: updatedSession });
    return NextResponse.json(updated);
  }

  if (action === "sendNow") {
    await executeAction(session, todo);
    const updatedSession = await getSession(id);
    return NextResponse.json(updatedSession);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export const dynamic = "force-dynamic";
