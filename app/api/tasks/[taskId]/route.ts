import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const token = getArondoToken(req);

  const runnerId = runnerManager.getRunnerForTask(taskId);
  if (runnerId && !(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = await runnerManager.deleteTask(taskId);
  if (!ok) {
    return NextResponse.json(
      { error: "Task not found or still running" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
