import { NextResponse } from "next/server";
import { getProjects, deleteProject } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";

export async function GET() {
  const projects = await getProjects();
  const knownRunners = await runnerManager.getAllKnownRunners();
  const runnerIds = new Set(knownRunners.map((r) => r.id));

  const valid: typeof projects = [];
  for (const project of projects) {
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
