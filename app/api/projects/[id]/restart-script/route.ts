import { NextRequest, NextResponse } from "next/server";
import { clearSessionLog, getMessages, getProject, getProjectScripts, updateMessage } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const token = getArondoToken(req);

  if (!(await verifyProjectPermission(projectId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { scriptName, messageId } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const scripts = await getProjectScripts(projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptName}" not found` }, { status: 404 });
  }

  const messages = await getMessages("", projectId);
  const runMessage = messages.find((message) => message.id === messageId && message.type === "script-run");
  if (!runMessage) {
    return NextResponse.json({ error: "Message is not a script run" }, { status: 400 });
  }
  const returnMessage = messages.find(
    (message) => message.parentId === messageId && message.type === "script-return" && !message.deleted,
  );
  if (returnMessage && (returnMessage.content.startsWith("✅") || returnMessage.content.startsWith("🛑"))) {
    return NextResponse.json({ error: "Only failed script runs can be retried" }, { status: 400 });
  }

  if (returnMessage) {
    await Promise.all([
      updateMessage("", returnMessage.id, { deleted: true }, projectId),
      updateMessage("", messageId, { exitCode: undefined, stoppedByUser: false }, projectId),
      clearSessionLog("", messageId, projectId),
    ]);
  }

  const ok = await runnerManager.restartTask("", messageId, script.command, project.repoPath);
  if (!ok) {
    if (returnMessage) await updateMessage("", returnMessage.id, { deleted: false }, projectId);
    return NextResponse.json({ error: "Task not found or runner unavailable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
