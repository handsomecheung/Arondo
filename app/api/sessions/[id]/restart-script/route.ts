import { NextRequest, NextResponse } from "next/server";
import { getSession, getProjectScripts } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);

  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { scriptName, messageId } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const scripts = await getProjectScripts(session.projectId);
  // Not a predefined script -> it's a raw shell command entered via "!" in chat; re-run it as-is.
  const script = scripts.find((s) => s.name === scriptName) ?? { name: scriptName, command: scriptName };

  const ok = await runnerManager.restartTask(id, messageId, script.command, session.repoPath);
  if (!ok) {
    return NextResponse.json({ error: "Task not found or runner unavailable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
