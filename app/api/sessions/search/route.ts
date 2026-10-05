import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessions, getMessages, getProjects, getSessions, getShowTempDirSessions, isTempDirProject } from "@/lib/store";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

const MAX_QUERY_LENGTH = 500;

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `q must be at most ${MAX_QUERY_LENGTH} characters` }, { status: 400 });
  }

  const [activeSessions, archivedSessions, projects, showTempDirSessions] = await Promise.all([
    getSessions(),
    getArchivedSessions(),
    getProjects(),
    getShowTempDirSessions(),
  ]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const normalizedQuery = query.toLocaleLowerCase();
  const sessionIds = new Set<string>();

  await Promise.all([...activeSessions, ...archivedSessions].map(async (session) => {
    const project = session.projectId ? projectsById.get(session.projectId) : undefined;
    if ((session.projectId && !project) || (!showTempDirSessions && project && isTempDirProject(project))) {
      return;
    }
    if (!(await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token))) {
      return;
    }
    if ((session.name || "Untitled").toLocaleLowerCase().includes(normalizedQuery)) {
      sessionIds.add(session.id);
      return;
    }

    const messages = await getMessages(session.id);
    if (messages.some((message) => !message.deleted && message.content.toLocaleLowerCase().includes(normalizedQuery))) {
      sessionIds.add(session.id);
    }
  }));

  return NextResponse.json({ sessionIds: [...sessionIds] });
}

export const dynamic = "force-dynamic";
