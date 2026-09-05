import { NextRequest, NextResponse } from "next/server";
import { clearSessionLog, getMessages, getSession, getProjectScripts, updateMessage, updateSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

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

  const messages = await getMessages(id);
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
      updateMessage(id, returnMessage.id, { deleted: true }),
      updateMessage(id, messageId, { exitCode: undefined, stoppedByUser: false }),
      clearSessionLog(id, messageId),
    ]);
    const updatedSession = await updateSession(id, {
      status: "script-running",
      errorMessage: undefined,
      runningScripts: [...(session.runningScripts || []), scriptName],
    });
    eventBus.publish({ type: "session_updated", payload: updatedSession });
  }

  const ok = await runnerManager.restartTask(id, messageId, script.command, session.repoPath);
  if (!ok) {
    if (returnMessage) {
      await Promise.all([
        updateMessage(id, returnMessage.id, { deleted: false }),
        updateSession(id, { status: "error", errorMessage: returnMessage.content }),
      ]);
    }
    return NextResponse.json({ error: "Task not found or runner unavailable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
