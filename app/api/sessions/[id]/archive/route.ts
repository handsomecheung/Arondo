import { NextRequest, NextResponse } from "next/server";
import { archiveSession, isSessionArchived } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isSessionArchived(id)) {
    return NextResponse.json({ error: "Session is already archived" }, { status: 400 });
  }

  try {
    await archiveSession(id, true);
    eventBus.publish({ type: "session_deleted", payload: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to archive session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to archive session" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
