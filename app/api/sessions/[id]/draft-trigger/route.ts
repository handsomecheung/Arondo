import { NextRequest, NextResponse } from "next/server";
import { getSession, getScheduledTasks, addScheduledTask, updateScheduledTask } from "@/lib/store";
import { getArondoToken, verifySessionPermission, getUuidByToken } from "@/lib/auth";

// Toggles a draft session between manual-only and auto ("codebaseReady") send.
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
  const existing = tasks.find(
    (t) => t.status === "pending" && t.trigger.kind === "codebaseReady" && t.action.sessionId === id,
  );

  if (existing) {
    await updateScheduledTask(existing.id, { status: "cancelled" });
    return NextResponse.json({ mode: "manual" });
  }

  await addScheduledTask({
    trigger: { kind: "codebaseReady", runnerId: session.runnerId, repoPath: session.repoPath },
    action: { kind: "sendMessage", sessionId: id, message: session.prompt },
    tokenUuid: getUuidByToken(token) || undefined,
  });
  return NextResponse.json({ mode: "codebaseReady" });
}

export const dynamic = "force-dynamic";
