import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { sessionId, messageId } = await req.json();

  if (sessionId === undefined || sessionId === null || !messageId) {
    return NextResponse.json(
      { error: "sessionId and messageId are required" },
      { status: 400 },
    );
  }

  const token = getArondoToken(req);
  const taskId = runnerManager.getTaskIdByPtyKey(sessionId, messageId);
  if (taskId) {
    const runnerId = runnerManager.getRunnerForTask(taskId);
    if (runnerId && !(await verifyRunnerPermission(runnerId, token))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ok = await runnerManager.killTask(sessionId, messageId);
  if (!ok) {
    return NextResponse.json(
      { error: "Task not found or already finished" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
