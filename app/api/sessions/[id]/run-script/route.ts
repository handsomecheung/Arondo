import { NextRequest, NextResponse } from "next/server";
import { getSession, getProjectScripts, addMessage, updateSession, clearSessionLog, appendSessionLog } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { spawn } from "child_process";

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

  // Look up the script command from project scripts
  const scripts = await getProjectScripts(session.projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptName}" not found` }, { status: 404 });
  }

  // Add system message showing which command will run
  const systemMsg = await addMessage({
    sessionId: id,
    role: "system",
    content: `⚙️ Running script: **${script.name}**\n\`\`\`bash\n${script.command}\n\`\`\``,
    type: "script-run",
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  // Update session status to script-running and append to runningScripts
  const updatedSession = await updateSession(id, {
    status: "script-running",
    runningScripts: [...runningScripts, scriptName],
  });
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  // Run the script in background
  runScriptInBackground(id, systemMsg.id, scriptName, script.command, session.repoPath);

  return NextResponse.json({ success: true });
}

async function runScriptInBackground(
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

  try {
    await clearLog(sessionId, messageId);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("bash", ["-c", command], {
        cwd: repoPath,
        env: { ...process.env },
      });

      const handleLine = async (line: string) => {
        await appendLog(sessionId, messageId, line);
        eventBus.publish({
          type: "agent_output",
          payload: { sessionId, messageId, line },
        });
      };

      proc.stdout.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        lines.forEach((line) => {
          if (line !== "" || lines.length > 1) handleLine(line);
        });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        lines.forEach((line) => {
          if (line !== "" || lines.length > 1) handleLine(line);
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script exited with code ${code}`));
        }
      });

      proc.on("error", reject);
    });

    const store = await import("@/lib/store");
    const currentSession = await store.getSession(sessionId);
    const currentRunning = currentSession?.runningScripts || [];
    const nextRunning = currentRunning.filter((name) => name !== scriptName);
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
