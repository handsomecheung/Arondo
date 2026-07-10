import { NextRequest, NextResponse } from "next/server";
import { getScheduledTask, updateScheduledTask } from "@/lib/store";
import { getArondoToken } from "@/lib/auth";
import { scopeOf, hasScopePermission } from "@/lib/scheduled-task-scope";

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
