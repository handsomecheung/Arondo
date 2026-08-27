import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessions, getProjects, isTempDirProject, getShowTempDirSessions } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sessions, projects] = await Promise.all([getArchivedSessions(), getProjects()]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const showTempDirSessions = await getShowTempDirSessions();
  const valid: typeof sessions = [];
  for (const session of sessions) {
    const project = projectsById.get(session.projectId);
    if (!project || (!showTempDirSessions && isTempDirProject(project))) continue;

    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
    if (isAllowed) valid.push(session);
  }

  return NextResponse.json(valid);
}

export const dynamic = "force-dynamic";
