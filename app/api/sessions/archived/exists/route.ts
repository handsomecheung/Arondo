import { getShowAutomationSessions } from "@/lib/automation";
import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessionPaths, getProjects, getAutomationSessionRetentionHours } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";
import fs from "fs/promises";

// Helper to load only the minimal necessary metadata from each session file
async function readSessionMetadata(filePath: string): Promise<{ runnerId: string; projectId?: string; automation?: boolean; createdAt?: string; updatedAt?: string } | null> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [filePaths, projects] = await Promise.all([getArchivedSessionPaths(), getProjects()]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const automationSessionRetentionHours = await getAutomationSessionRetentionHours();
  const automationSessionMaxAgeMs = automationSessionRetentionHours * 60 * 60 * 1000;
  const showAutomationSessions = await getShowAutomationSessions();

  for (const filePath of filePaths) {
    const session = await readSessionMetadata(filePath);
    if (session?.automation) {
      const age = Math.max(
        session.createdAt ? Date.now() - new Date(session.createdAt).getTime() : 0,
        session.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : 0,
      );
      if (age > automationSessionMaxAgeMs) continue;
      if (!showAutomationSessions) continue;
    }
    if (session && session.runnerId) {
      const project = session.projectId ? projectsById.get(session.projectId) : undefined;
      if (session.projectId && !project) continue;

      const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
      if (isAllowed) {
        // Short-circuit: we only need to know if at least one accessible archived session exists
        return NextResponse.json({ exists: true });
      }
    }
  }

  return NextResponse.json({ exists: false });
}

export const dynamic = "force-dynamic";
