import { NextRequest, NextResponse } from "next/server";
import { getProjects, deleteProject, getSessions, getArchivedSessions } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken, getUuidByToken, getRoleByToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admin is not subject to the per-client project isolation filter, so it
  // can reach every project behind the sessions it can see (sessions are
  // filtered by runner allowance only, and admins are always allowed).
  const isAdmin = getRoleByToken(token) === "admin";

  const clientUuid = getUuidByToken(token);
  const clientProjectIds = new Set<string>();
  if (!isAdmin && clientUuid) {
    const [activeSessions, archivedSessions] = await Promise.all([
      getSessions(),
      getArchivedSessions(),
    ]);
    for (const s of activeSessions) {
      if (s.tokenUuid === clientUuid && s.projectId) {
        clientProjectIds.add(s.projectId);
      }
    }
    for (const s of archivedSessions) {
      if (s.tokenUuid === clientUuid && s.projectId) {
        clientProjectIds.add(s.projectId);
      }
    }
  }

  const projects = await getProjects();
  const knownRunners = await runnerManager.getAllKnownRunners();
  const runnerIds = new Set(knownRunners.map((r) => r.id));

  const candidates: typeof projects = [];
  for (const project of projects) {
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(project.runnerId, token);
    if (!isAllowed) {
      continue;
    }

    if (project.runnerId && !runnerIds.has(project.runnerId)) {
      console.log(`[projects] runner ${project.runnerId} for project ${project.id} no longer exists, deleting project`);
      await deleteProject(project.id);
      continue;
    }

    // Admin bypasses the per-client project filter (already skipped above
    // when collecting clientProjectIds, but keep the guard explicit here).
    if (!isAdmin && !clientProjectIds.has(project.id)) {
      continue;
    }

    candidates.push(project);
  }

  const projectsByRunner = new Map<string, typeof projects>();
  for (const p of candidates) {
    const list = projectsByRunner.get(p.runnerId) || [];
    list.push(p);
    projectsByRunner.set(p.runnerId, list);
  }

  const existenceResults = new Map<string, boolean>();
  await Promise.all(
    Array.from(projectsByRunner.entries()).map(async ([runnerId, runnerProjects]) => {
      if (!runnerManager.getRunner(runnerId)) return;
      const paths = runnerProjects.map((p) => p.repoPath);
      const res = await runnerManager.checkPathsExist(runnerId, paths);
      for (const [pathStr, exists] of Object.entries(res)) {
        existenceResults.set(`${runnerId}:${pathStr}`, exists);
      }
    })
  );

  const valid = candidates.filter((project) => {
    const key = `${project.runnerId}:${project.repoPath}`;
    if (existenceResults.has(key)) {
      return existenceResults.get(key) === true;
    }
    return true;
  });

  return NextResponse.json(valid);
}

export const dynamic = "force-dynamic";
