import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, addMessage } from "@/lib/store";
import { getAgent, AgentType } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";

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
    return NextResponse.json({ error: "Agent is already running for this session" }, { status: 400 });
  }

  const { message } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trimmedMessage = message.trim();

  try {
    // 1. Save user's follow-up message to history
    const userMsg = await addMessage({
      sessionId: id,
      role: "user",
      content: trimmedMessage,
    });
    eventBus.publish({ type: "message_added", payload: userMsg });

    // 3. Get the agent
    const agent = getAgent(session.agentType as AgentType);

    // 2. Use the new instruction directly as follow-up prompt (since the session context is resumed)
    const followUpPrompt = trimmedMessage;
    const command = agent.getCommand({ prompt: followUpPrompt, repoPath: session.repoPath, sessionId: id, isResume: true });

    // 4. Update session status back to running and store the command
    const updatedSession = await updateSession(id, { status: "running", command });
    eventBus.publish({ type: "session_updated", payload: updatedSession });

    // 5. Add system message logging the CLI command to chat
    const systemMsg = await addMessage({
      sessionId: id,
      role: "system",
      content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
    });
    eventBus.publish({ type: "message_added", payload: systemMsg });

    // 6. Trigger the agent run asynchronously in background
    runAgentInBackground(id, systemMsg.id, session.agentType, followUpPrompt, session.repoPath);

    return NextResponse.json({ success: true, message: userMsg });
  } catch (error: any) {
    console.error("Failed to append follow-up message:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}

async function runAgentInBackground(
  sessionId: string,
  messageId: string,
  agentType: string,
  prompt: string,
  repoPath: string
) {
  const { updateSession: update, addMessage: addMsg, clearSessionLog, appendSessionLog } = await import("@/lib/store");

  try {
    // Reset/clear logs for this follow-up execution
    await clearSessionLog(sessionId, messageId);

    const agent = getAgent(agentType as AgentType);

    const result = await agent.run({
      prompt,
      repoPath,
      sessionId,
      isResume: true,
      onOutput: async (line) => {
        await appendSessionLog(sessionId, messageId, line);
        eventBus.publish({ type: "agent_output", payload: { sessionId, messageId, line } });
      },
    });

    const updated = await update(sessionId, {
      status: result.success ? "done" : "error",
      errorMessage: result.error,
    });

    const content = result.success
      ? "✅ Done!"
      : `❌ Error: ${result.error}`;

    const agentMsg = await addMsg({ sessionId, role: "agent", content });
    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await appendSessionLog(sessionId, messageId, `[Internal error] ${errorMessage}`);
    const updated = await update(sessionId, { status: "error", errorMessage });
    const agentMsg = await addMsg({
      sessionId,
      role: "system",
      content: `❌ Internal error: ${errorMessage}`,
    });
    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }
}

export const dynamic = "force-dynamic";
