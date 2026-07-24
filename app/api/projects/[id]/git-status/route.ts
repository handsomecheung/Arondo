import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);

  if (!(await verifyProjectPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const runnerId = runnerManager.resolveRunnerId(project.runnerId);
    if (!runnerId) {
      return NextResponse.json({ hasChanges: false, isGitRepo: false, error: "No runner" }, { status: 200 });
    }

    const result = await runnerManager.sendRequest(
      runnerId,
      "git.status",
      { workDir: project.repoPath }
    );

    return NextResponse.json({
      hasChanges: result.hasChanges,
      isGitRepo: result.isGitRepo,
    });
  } catch (error: any) {
    console.error("Failed to check git status:", error);
    return NextResponse.json({
      hasChanges: false,
      isGitRepo: false,
      error: error.message,
    }, { status: 200 });
  }
}

export const dynamic = "force-dynamic";
