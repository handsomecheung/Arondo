import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionArchived, unarchiveSession } from "@/lib/store";
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

  if (!isSessionArchived(id)) {
    return NextResponse.json({ error: "Session is not archived" }, { status: 400 });
  }

  try {
    await unarchiveSession(id);
    const session = await getSession(id);
    eventBus.publish({ type: "session_updated", payload: session });
    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Failed to unarchive session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to unarchive session" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
