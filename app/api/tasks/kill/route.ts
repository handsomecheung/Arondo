import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function POST(req: NextRequest) {
  const { sessionId, messageId } = await req.json();

  if (!sessionId || !messageId) {
    return NextResponse.json(
      { error: "sessionId and messageId are required" },
      { status: 400 },
    );
  }

  const ok = await runnerManager.killTask(sessionId, messageId);
  if (!ok) {
    return NextResponse.json(
      { error: "Task not found or already finished" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
