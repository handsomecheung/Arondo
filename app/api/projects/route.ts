import { NextRequest, NextResponse } from "next/server";
import { getProjects, deleteProject, getTempDirProjectRetentionHours, isTempDirProject, getShowTempDirSessions } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projects = await getProjects();
  const knownRunners = await runnerManager.getAllKnownRunners();
  const runnerIds = new Set(knownRunners.map((r) => r.id));
  const showTempDirSessions = await getShowTempDirSessions();
  const tempDirProjectRetentionHours = await getTempDirProjectRetentionHours();
  const tempDirProjectMaxAgeMs = tempDirProjectRetentionHours * 60 * 60 * 1000;

  const candidates: typeof projects = [];
  for (const project of projects) {
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(project.runnerId, token);
    if (!isAllowed) {
      continue;
    }

    if (!runnerIds.has(project.runnerId)) {
      console.log(`[projects] runner ${project.runnerId} for project ${project.id} no longer exists, deleting project`);
      await deleteProject(project.id);
      continue;
    }

    if (isTempDirProject(project)) {
      const age = Date.now() - new Date(project.createdAt).getTime();
      if (age > tempDirProjectMaxAgeMs) {
        console.log(`[projects] temp dir project ${project.id} older than ${tempDirProjectRetentionHours} hours, deleting`);
        await deleteProject(project.id);
        continue;
      }
      if (!showTempDirSessions) {
        continue;
      }
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
