import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";

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

export const dynamic = "force-dynamic";
