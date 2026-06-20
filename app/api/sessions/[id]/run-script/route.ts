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
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  // Update session status to running
  const updatedSession = await updateSession(id, { status: "running" });
  eventBus.publish({ type: "session_updated", payload: updatedSession });

  // Run the script in background
  runScriptInBackground(id, systemMsg.id, script.command, session.repoPath);

  return NextResponse.json({ success: true });
}

async function runScriptInBackground(
  sessionId: string,
  messageId: string,
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

    const updated = await updateSession(sessionId, { status: "done" });
    const doneMsg = await addMsg({
      sessionId,
      role: "system",
      content: `✅ Script completed successfully.`,
    });
    eventBus.publish({ type: "message_added", payload: doneMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await appendLog(sessionId, messageId, `[Error] ${errorMessage}`);
    const updated = await updateSession(sessionId, {
      status: "error",
      errorMessage,
    });
    const errMsg = await addMsg({
      sessionId,
      role: "system",
      content: `❌ Error: ${errorMessage}`,
    });
    eventBus.publish({ type: "message_added", payload: errMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }
}

export const dynamic = "force-dynamic";
