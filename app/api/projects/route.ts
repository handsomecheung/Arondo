import { NextRequest, NextResponse } from "next/server";
import { getProjects, deleteProject } from "@/lib/store";
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

  const valid: typeof projects = [];
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
    valid.push(project);
  }

  return NextResponse.json(valid);
}

export const dynamic = "force-dynamic";
