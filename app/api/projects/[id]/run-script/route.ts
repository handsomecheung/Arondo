import { NextRequest, NextResponse } from "next/server";
import { dispatchProjectScript } from "@/lib/project-actions";
import { getArondoToken, verifyProjectPermission, getUuidByToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const token = getArondoToken(req);

  if (!(await verifyProjectPermission(projectId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scriptName } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }

  const result = await dispatchProjectScript(projectId, scriptName, {
    tokenUuid: getUuidByToken(token) || undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, taskId: result.taskId, messageId: result.messageId });
}

export const dynamic = "force-dynamic";
