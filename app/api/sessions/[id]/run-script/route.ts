import { NextRequest, NextResponse } from "next/server";
import { dispatchSessionScript } from "@/lib/session-actions";
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

  const { command, prompt } = await req.json();
  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const result = await dispatchSessionScript(id, command, {
    prompt,
    tokenUuid: getUuidByToken(token) || undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}

export const dynamic = "force-dynamic";
