import { NextRequest, NextResponse } from "next/server";
import { addTodoMessage, getSession, isSessionArchived, type TodoTrigger } from "@/lib/store";
import { getArondoToken, verifySessionPermission, getUuidByToken } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

// Creates a new todo message on an existing session — used to queue a
// follow-up behind a currently-running agent ("afterSession" trigger), and
// generically for any future case that adds another pending todo.
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
    return NextResponse.json({ error: "Session is archived. Unarchive it to queue messages." }, { status: 403 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { message, prompt, trigger } = (await req.json()) as {
    message?: string;
    prompt?: string;
    trigger?: TodoTrigger;
  };
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (!trigger || !trigger.kind) {
    return NextResponse.json({ error: "trigger is required" }, { status: 400 });
  }

  const todoMessage = await addTodoMessage(id, {
    content: message.trim(),
    prompt: prompt?.trim() || undefined,
    trigger,
    tokenUuid: getUuidByToken(token) || undefined,
  });
  eventBus.publish({ type: "message_added", payload: todoMessage });
  const updated = await getSession(id);
  if (updated) eventBus.publish({ type: "session_updated", payload: updated });

  return NextResponse.json(todoMessage, { status: 201 });
}

export const dynamic = "force-dynamic";
