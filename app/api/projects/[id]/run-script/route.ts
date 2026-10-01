import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getUuidByToken, verifyProjectPermission } from "@/lib/auth";
import { dispatchProjectCommand } from "@/lib/project-command-actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifyProjectPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { command } = await req.json();
  if (typeof command !== "string" || !command.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const result = await dispatchProjectCommand(id, command.trim(), {
    tokenUuid: getUuidByToken(token) || undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, taskId: result.taskId, messageId: result.messageId });
}

export const dynamic = "force-dynamic";
