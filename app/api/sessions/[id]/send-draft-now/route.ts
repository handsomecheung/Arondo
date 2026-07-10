import { NextRequest, NextResponse } from "next/server";
import { getSession, getScheduledTasks } from "@/lib/store";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { executeAction } from "@/lib/scheduler";

// Manually dispatches a draft session right now, bypassing its codebaseReady trigger.
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
  if (!task) {
    return NextResponse.json({ error: "No pending draft trigger found for this session" }, { status: 400 });
  }

  await executeAction(task);
  const updated = await getSession(id);
  return NextResponse.json(updated);
}

export const dynamic = "force-dynamic";
