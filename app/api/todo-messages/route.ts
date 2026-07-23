import { NextRequest, NextResponse } from "next/server";
import { getSessions, getPendingTodoMessages } from "@/lib/store";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

// Flat list of every session's pending todo messages, joined with the
// session it belongs to — backs the Tasks dashboard "Upcoming" section.
// Read-time join instead of a stored global table.
export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await getSessions();
  const items = [];
  for (const session of sessions) {
    if (!session.pendingTodoMessageIds || session.pendingTodoMessageIds.length === 0) continue;
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
    if (!isAllowed) continue;

    const todos = await getPendingTodoMessages(session.id);
    for (const todo of todos) {
      items.push({
        id: todo.id,
        sessionId: session.id,
        sessionName: session.name,
        content: todo.content,
        trigger: todo.todoTrigger,
        createdAt: todo.createdAt,
      });
    }
  }

  return NextResponse.json(items);
}

export const dynamic = "force-dynamic";
