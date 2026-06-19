import { NextRequest, NextResponse } from "next/server";
import { getSessions, updateSession, addMessage } from "@/lib/store";
import { getAgent } from "@/lib/agents";
import { eventBus } from "@/lib/event-bus";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * GitHub Webhook receiver.
 * Listens for PR review comments and feeds them back to the agent.
 *
 * Setup in GitHub repo settings:
 *   Payload URL: https://<your-host>/api/webhook
 *   Content type: application/json
 *   Secret: set GITHUB_WEBHOOK_SECRET env var
 *   Events: Pull request review comments, Issue comments
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify webhook signature if secret is configured
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature || !verifySignature(rawBody, secret, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(rawBody);

  // Only handle PR review comments
  if (event !== "pull_request_review_comment" && event !== "issue_comment") {
    return NextResponse.json({ message: "Event ignored" });
  }

  // Only handle new comments (not edits/deletes)
  if (payload.action !== "created") {
    return NextResponse.json({ message: "Action ignored" });
  }

  const prUrl = payload.pull_request?.html_url ?? payload.issue?.pull_request?.html_url;
  if (!prUrl) {
    return NextResponse.json({ message: "Not a PR comment" });
  }

  // Find the session associated with this PR
  const sessions = await getSessions();
  const session = sessions.find((s) => s.prUrl === prUrl);
  if (!session) {
    return NextResponse.json({ message: "No session found for this PR" });
  }

  if (session.status === "running") {
    return NextResponse.json({ message: "Agent is already running for this session" });
  }

  const commentBody: string = payload.comment?.body ?? "";
  const commenter: string = payload.comment?.user?.login ?? "unknown";
  const commentUrl: string = payload.comment?.html_url ?? prUrl;

  // Record comment as user message in the session
  const content = `📝 Review comment from @${commenter}:\n${commentBody}\n\n[View comment](${commentUrl})`;
  const userMsg = await addMessage({ sessionId: session.id, role: "user", content });
  eventBus.publish({ type: "message_added", payload: userMsg });

  // Build a follow-up prompt
  const followUpPrompt =
    `You previously worked on this repository and created PR: ${prUrl}\n` +
    `A reviewer left the following comment:\n\n"${commentBody}"\n\n` +
    `Please address the reviewer's feedback, commit the changes, and push to the existing PR branch.`;

  // Retrieve command
  const agent = getAgent(session.agentType as "gemini");
  const command = agent.getCommand({ prompt: followUpPrompt, repoPath: session.repoPath, sessionId: session.id, isResume: true });

  // Update session status to running and store the command
  const updated = await updateSession(session.id, { status: "running", command });
  eventBus.publish({ type: "session_updated", payload: updated });

  // Create system message logging the CLI command to chat
  const systemMsg = await addMessage({
    sessionId: session.id,
    role: "system",
    content: `⚙️ Executing command:\n\`\`\`bash\n${command}\n\`\`\``,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  // Run follow-up agent in background
  runFollowUp(session.id, systemMsg.id, session.agentType, followUpPrompt, session.repoPath, prUrl);

  return NextResponse.json({ message: "Follow-up agent run started", sessionId: session.id });
}

async function runFollowUp(
  sessionId: string,
  messageId: string,
  agentType: string,
  prompt: string,
  repoPath: string,
  prUrl: string
) {
  const { updateSession: update, addMessage: addMsg, clearSessionLog, appendSessionLog } = await import("@/lib/store");

  try {
    // Clear logs for this new follow-up run
    await clearSessionLog(sessionId, messageId);

    const agent = getAgent(agentType as "gemini");
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
      prUrl: result.prUrl ?? prUrl,
      errorMessage: result.error,
    });

    const content = result.success
      ? `✅ Follow-up complete! Changes pushed to ${result.prUrl ?? prUrl}`
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

function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
