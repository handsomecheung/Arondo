import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { getGenMessages, getGenMemory } from "@/lib/gen/store";
import { handleUserGenMessage, reconcileRunningGenSubAgents } from "@/lib/gen/orchestrator";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await reconcileRunningGenSubAgents();
  const [messages, memory] = await Promise.all([
    getGenMessages(),
    getGenMemory(),
  ]);

  return NextResponse.json({ messages, memory });
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const result = await handleUserGenMessage(message, token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Failed to process message" }, { status: 400 });
  }

  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
