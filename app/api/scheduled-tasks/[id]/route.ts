import { NextRequest, NextResponse } from "next/server";
import { getScheduledTask, updateScheduledTask, type ScheduledTask } from "@/lib/store";
import { getArondoToken, verifySessionPermission, verifyProjectPermission } from "@/lib/auth";

function scopeOf(task: Pick<ScheduledTask, "trigger" | "action">): { sessionId?: string; projectId?: string } {
  if (task.trigger.kind === "afterSession") return { sessionId: task.trigger.sessionId };
  if (task.action.kind === "sendMessage") return { sessionId: task.action.sessionId };
  return { sessionId: task.action.sessionId, projectId: task.action.projectId };
}

async function hasScopePermission(
  scope: { sessionId?: string; projectId?: string },
  token: string | null,
): Promise<boolean> {
  if (scope.sessionId) return verifySessionPermission(scope.sessionId, token);
  if (scope.projectId) return verifyProjectPermission(scope.projectId, token);
  return false;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(request);

  const task = await getScheduledTask(id);
  if (!task) {
    return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
  }
  if (!(await hasScopePermission(scopeOf(task), token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (task.status !== "pending") {
    return NextResponse.json({ error: "Only pending tasks can be cancelled" }, { status: 400 });
  }

  const updated = await updateScheduledTask(id, { status: "cancelled" });
  return NextResponse.json(updated);
}

export const dynamic = "force-dynamic";
