import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken, verifySessionPermission } from "@/lib/auth";
import { getMessages } from "@/lib/store";
import { isMessageIncomplete, type CompletenessContext } from "@/lib/message-completeness";

export async function POST(req: NextRequest) {
  const token = getArondoToken(req);
  if (!isValidToken(token)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message, sessionId } = await req.json();
  if (typeof message !== "string" || (sessionId !== undefined && typeof sessionId !== "string")) {
    return NextResponse.json({ error: "Invalid message or sessionId" }, { status: 400 });
  }
  if (sessionId !== undefined && !(await verifySessionPermission(sessionId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = sessionId ? await getMessages(sessionId) : [];
  const context: CompletenessContext[] = messages
    .filter((m) => !m.deleted && (m.role === "user" || m.role === "agent") && (!m.type || m.type === "chat-user" || m.type === "agent-return"))
    .slice(-2)
    .map((m) => ({ role: m.role as CompletenessContext["role"], content: m.content }));
  return NextResponse.json({ incomplete: await isMessageIncomplete(message, context) });
}
