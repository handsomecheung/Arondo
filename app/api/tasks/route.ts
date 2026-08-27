import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { getProjects, getSessions, isTempDirProject, isSessionArchived, getShowTempDirSessions } from "@/lib/store";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sessions, projects] = await Promise.all([getSessions(), getProjects()]);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const tasks = runnerManager.getAllTasks();
  const showTempDirSessions = await getShowTempDirSessions();

  const filtered = [];
  for (const task of tasks) {
    const session = task.sessionId ? sessionsById.get(task.sessionId) : undefined;
    const projectId = task.projectId || session?.projectId;
    if (projectId) {
      const project = projectsById.get(projectId);
      if (!project || (!showTempDirSessions && isTempDirProject(project))) {
        continue;
      }
    }

    if (session?.projectId) {
      const project = projectsById.get(session.projectId);
      if (!project || (!showTempDirSessions && isTempDirProject(project))) {
        continue;
      }
    }

    if (task.sessionId && isSessionArchived(task.sessionId)) {
      continue;
    }
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(task.runnerId, token);
    if (isAllowed) {
      filtered.push(task);
    }
  }

  return NextResponse.json(filtered);
}

export const dynamic = "force-dynamic";
