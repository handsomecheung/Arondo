import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSession, updateSession } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function DELETE(
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

  try {
    runnerManager.removeTasksForSession(id);
    await deleteSession(id);
    eventBus.publish({ type: "session_deleted", payload: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { name, agentType } = body as { name?: string; agentType?: string };

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const patch: Record<string, any> = {};
    if (name !== undefined) patch.name = name;
    if (agentType !== undefined) patch.agentType = agentType;
    const updated = await updateSession(id, patch);
    eventBus.publish({ type: "session_updated", payload: updated });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update session" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
