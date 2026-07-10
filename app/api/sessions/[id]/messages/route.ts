import { NextRequest, NextResponse } from "next/server";
import { dispatchFollowupMessage } from "@/lib/session-actions";
import { isSessionArchived } from "@/lib/store";
import { getArondoToken, verifySessionPermission, getUuidByToken } from "@/lib/auth";

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
    return NextResponse.json({ error: "Session is archived. Unarchive it to send messages." }, { status: 403 });
  }

  const { message, type, prompt } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await dispatchFollowupMessage(id, message, {
      prompt,
      type,
      tokenUuid: getUuidByToken(token) || undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error("Failed to append follow-up message:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
