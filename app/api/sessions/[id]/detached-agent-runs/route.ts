import { NextRequest, NextResponse } from "next/server";
import { dispatchDetachedAgent } from "@/lib/session-actions";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { isSessionArchived, type DetachedAgentKind } from "@/lib/store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isSessionArchived(id)) {
    return NextResponse.json({ error: "Session is archived. Unarchive it to run a separate agent." }, { status: 403 });
  }

  const { kind, message = "", agentType } = await req.json() as {
    kind?: DetachedAgentKind;
    message?: string;
    agentType?: string;
  };
  if (kind !== "review" && kind !== "btw") {
    return NextResponse.json({ error: "kind must be review or btw" }, { status: 400 });
  }
  if (agentType && !["auto", "antigravity", "claude", "codex", "opencode"].includes(agentType)) {
    return NextResponse.json({ error: "agentType is invalid" }, { status: 400 });
  }
  if (kind === "btw" && !message.trim()) {
    return NextResponse.json({ error: "message is required for btw" }, { status: 400 });
  }

  const result = await dispatchDetachedAgent(id, kind, message, agentType);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, messageId: result.messageId });
}

export const dynamic = "force-dynamic";
