import { NextRequest, NextResponse } from "next/server";
import { getSession, getProjectScripts, addMessage, updateSession, clearSessionLog } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "running") {
    return NextResponse.json(
      { error: "Agent is already running for this session" },
      { status: 400 }
    );
  }

  const { scriptName } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }

  const runningScripts = session.runningScripts || [];

  const scripts = await getProjectScripts(session.projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptName}" not found` }, { status: 404 });
  }

  const systemMsg = await addMessage({
    sessionId: id,
    role: "system",
    content: `⚙️ Running script: **${script.name}**\n\`\`\`bash\n${script.command}\n\`\`\``,
    type: "script-run",
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const updatedSession = await updateSession(id, {
    status: "script-running",
    runningScripts: [...runningScripts, scriptName],
  });
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  // Run script via runner
  const runnerId = runnerManager.resolveRunnerId(session.runnerId);
  if (!runnerId) {
    return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
  }

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: id,
    messageId: systemMsg.id,
    type: "script",
    scriptName,
    createdAt: Date.now(),
  });

  await clearSessionLog(id, systemMsg.id);

  runnerManager
    .sendRequest(runnerId, "exec.script", {
      taskId,
      command: script.command,
      workDir: session.repoPath,
      cols: 120,
      rows: 30,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const removeIdx = runningScripts.indexOf(scriptName);
      const nextRunning = removeIdx >= 0
        ? [...runningScripts.slice(0, removeIdx), ...runningScripts.slice(removeIdx + 1)]
        : [...runningScripts];
      const nextStatus = nextRunning.length > 0 ? "script-running" : "error";
      const updated = await updateSession(id, {
        status: nextStatus as any,
        runningScripts: nextRunning,
        errorMessage,
      });
      const errMsg = await addMessage({
        sessionId: id,
        role: "system",
        content: `❌ Error: ${errorMessage}`,
        type: "script-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    });

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
