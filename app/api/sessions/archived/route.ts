import { getShowAutomationSessions } from "@/lib/automation";
import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessions, getProjects, deleteSession, getAutomationSessionRetentionHours } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sessions, projects] = await Promise.all([getArchivedSessions(), getProjects()]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const automationSessionRetentionHours = await getAutomationSessionRetentionHours();
  const automationSessionMaxAgeMs = automationSessionRetentionHours * 60 * 60 * 1000;
  const showAutomationSessions = await getShowAutomationSessions();
  const valid: typeof sessions = [];
  for (const session of sessions) {
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
    if (!isAllowed) continue;

    if (session.automation) {
      const age = Math.max(
        Date.now() - new Date(session.createdAt).getTime(),
        Date.now() - new Date(session.updatedAt).getTime(),
      );
      if (age > automationSessionMaxAgeMs) {
        console.log(`[sessions] archived automation session ${session.id} older than ${automationSessionRetentionHours} hours, deleting`);
        runnerManager.removeTasksForSession(session.id);
        await deleteSession(session.id);
        eventBus.publish({ type: "session_deleted", payload: { id: session.id } });
        continue;
      }
      if (!showAutomationSessions) continue;
    }

    const project = session.projectId ? projectsById.get(session.projectId) : undefined;
    if (session.projectId && !project) continue;

    valid.push(session);
  }

  return NextResponse.json(valid);
}

export const dynamic = "force-dynamic";
