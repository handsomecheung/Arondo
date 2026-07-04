import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/store";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const token = getArondoToken(req);
  if (!(await verifySessionPermission(sessionId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await getMessages(sessionId);
  return NextResponse.json(messages);
}

export const dynamic = "force-dynamic";
