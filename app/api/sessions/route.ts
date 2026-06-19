import { NextRequest, NextResponse } from "next/server";
import { getSessions, createSession, updateSession, addMessage } from "@/lib/store";
import { getAgent } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";

export async function GET() {
  const sessions = await getSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, repoPath, agentType = "gemini" } = body as {
    prompt: string;
    repoPath: string;
    agentType?: string;
  };

  if (!prompt || !repoPath) {
    return NextResponse.json({ error: "prompt and repoPath are required" }, { status: 400 });
  }

  // Create the session record first to get session.id
  const session = await createSession({
    status: "running",
    prompt,
    agentType,
    repoPath,
  });

  // Get the agent and retrieve the execution command with sessionId
  const agent = getAgent(agentType as "gemini");
  const command = agent.getCommand({ prompt, repoPath, sessionId: session.id, isResume: false });

  // Update the session with the generated command
  await updateSession(session.id, { command });
  session.command = command;

  // Save the user message
  const userMessage = await addMessage({ sessionId: session.id, role: "user", content: prompt });
  eventBus.publish({ type: "message_added", payload: userMessage });

  // Add system message logging the CLI command to chat
  const systemMsg = await addMessage({
    sessionId: session.id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });
  eventBus.publish({ type: "session_updated", payload: session });

  // Run the agent asynchronously (fire-and-forget, result handled in background)
  runAgentInBackground(session.id, systemMsg.id, agentType, prompt, repoPath);

  return NextResponse.json(session, { status: 201 });
}

async function runAgentInBackground(
  sessionId: string,
  messageId: string,
  agentType: string,
  prompt: string,
  repoPath: string
) {
  const { updateSession, addMessage: addMsg, clearSessionLog, appendSessionLog } = await import("@/lib/store");

  try {
    // Initialize/clear log file bound to this specific messageId
    await clearSessionLog(sessionId, messageId);

    const agent = getAgent(agentType as "gemini");

    const result = await agent.run({
      prompt,
      repoPath,
      sessionId,
      isResume: false,
      onOutput: async (line) => {
        await appendSessionLog(sessionId, messageId, line);
        eventBus.publish({ type: "agent_output", payload: { sessionId, messageId, line } });
      },
    });

    const updated = await updateSession(sessionId, {
      status: result.success ? "done" : "error",
      prUrl: result.prUrl,
      errorMessage: result.error,
    });

    // Add agent summary message
    const content = result.success
      ? result.prUrl
        ? `✅ Done! PR created: ${result.prUrl}`
        : "✅ Done! (No PR URL found in output)"
      : `❌ Error: ${result.error}`;

    const agentMsg = await addMsg({ sessionId, role: "agent", content });
    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await appendSessionLog(sessionId, messageId, `[Internal error] ${errorMessage}`);
    const updated = await updateSession(sessionId, { status: "error", errorMessage });
    const agentMsg = await addMessage({ sessionId, role: "system", content: `❌ Internal error: ${errorMessage}` });
    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }
}

export const dynamic = "force-dynamic";
