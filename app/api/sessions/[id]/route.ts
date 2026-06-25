import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSession, updateSession } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const body = await req.json();
  const { name } = body as { name?: string };

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const updated = await updateSession(id, { name });
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
