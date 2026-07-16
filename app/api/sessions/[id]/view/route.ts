import { NextRequest, NextResponse } from "next/server";
import { touchSessionViewed } from "@/lib/store";
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

  const updated = await touchSessionViewed(id);
  if (!updated) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  eventBus.publish({ type: "session_updated", payload: updated });
  return NextResponse.json(updated);
}

export const dynamic = "force-dynamic";
