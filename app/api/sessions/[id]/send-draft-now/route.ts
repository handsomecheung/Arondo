import { NextRequest, NextResponse } from "next/server";
import { getSession, getScheduledTasks } from "@/lib/store";
import { getArondoToken, verifySessionPermission, getUuidByToken } from "@/lib/auth";
import { executeAction } from "@/lib/scheduler";
import { dispatchFollowupMessage } from "@/lib/session-actions";

// Manually dispatches a draft session right now, bypassing its codebaseReady trigger
// (or, for a manual-only draft with no scheduled task, sending it directly).
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
  if (session.status !== "draft") {
    return NextResponse.json({ error: "Session is not a draft" }, { status: 400 });
  }

  const tasks = await getScheduledTasks();
  const task = tasks.find((t) => t.status === "pending" && t.action.sessionId === id);
  if (task) {
    await executeAction(task);
  } else {
    const result = await dispatchFollowupMessage(id, session.prompt, {
      tokenUuid: getUuidByToken(token) || undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  }

  const updated = await getSession(id);
  return NextResponse.json(updated);
}

export const dynamic = "force-dynamic";
