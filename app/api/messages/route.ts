import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const messages = await getMessages(sessionId);
  return NextResponse.json(messages);
}

export const dynamic = "force-dynamic";
