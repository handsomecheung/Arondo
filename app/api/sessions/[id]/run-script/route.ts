import { NextRequest, NextResponse } from "next/server";
import { getSession, getProjectScripts, addMessage, updateSession, clearSessionLog, appendSessionLog } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { ptyManager } from "@/lib/pty-manager";

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
  if (runningScripts.includes(scriptName)) {
    return NextResponse.json(
      { error: `Script "${scriptName}" is already running` },
      { status: 400 }
    );
  }

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

  runScriptWithPty(id, systemMsg.id, scriptName, script.command, session.repoPath);

  return NextResponse.json({ success: true });
}

async function runScriptWithPty(
  sessionId: string,
  messageId: string,
  scriptName: string,
  command: string,
  repoPath: string
) {
  const {
    updateSession,
    addMessage: addMsg,
    clearSessionLog: clearLog,
    appendSessionLog: appendLog,
  } = await import("@/lib/store");

  const ptyId = `${sessionId}:${messageId}`;

  try {
    await clearLog(sessionId, messageId);

    ptyManager.create(ptyId, {
      command: "bash",
      args: ["-c", command],
      cwd: repoPath,
      onData: (data) => {
        appendLog(sessionId, messageId, data, true);
        eventBus.publish({
          type: "terminal_output",
          payload: { sessionId, messageId, data },
        });
      },
      onExit: async (exitCode) => {
        eventBus.publish({
          type: "terminal_exit",
          payload: { sessionId, messageId, code: exitCode },
        });
        try {
          const store = await import("@/lib/store");
          const currentSession = await store.getSession(sessionId);
          const currentRunning = currentSession?.runningScripts || [];
          const nextRunning = currentRunning.filter((name) => name !== scriptName);

          if (exitCode === 0) {
            const nextStatus = nextRunning.length > 0 ? "script-running" : "done";
            const updated = await updateSession(sessionId, {
              status: nextStatus,
              runningScripts: nextRunning,
            });
            const doneMsg = await addMsg({
              sessionId,
              role: "system",
              content: `✅ Script completed successfully.`,
              type: "script-return",
            });
            eventBus.publish({ type: "message_added", payload: doneMsg });
            eventBus.publish({ type: "session_updated", payload: updated });
          } else {
            const errorMessage = `Script exited with code ${exitCode}`;
            const nextStatus = nextRunning.length > 0 ? "script-running" : "error";
            const updated = await updateSession(sessionId, {
              status: nextStatus,
              runningScripts: nextRunning,
              errorMessage,
            });
            const errMsg = await addMsg({
              sessionId,
              role: "system",
              content: `❌ Error: ${errorMessage}`,
              type: "script-return",
            });
            eventBus.publish({ type: "message_added", payload: errMsg });
            eventBus.publish({ type: "session_updated", payload: updated });
          }
        } catch (err) {
          console.error("Error handling PTY exit:", err);
        }
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await appendLog(sessionId, messageId, `[Error] ${errorMessage}`);

    const store = await import("@/lib/store");
    const currentSession = await store.getSession(sessionId);
    const currentRunning = currentSession?.runningScripts || [];
    const nextRunning = currentRunning.filter((name) => name !== scriptName);
    const nextStatus = nextRunning.length > 0 ? "script-running" : "error";

    const updated = await updateSession(sessionId, {
      status: nextStatus,
      runningScripts: nextRunning,
      errorMessage,
    });
    const errMsg = await addMsg({
      sessionId,
      role: "system",
      content: `❌ Error: ${errorMessage}`,
      type: "script-return",
    });
    eventBus.publish({ type: "message_added", payload: errMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }
}

export const dynamic = "force-dynamic";
