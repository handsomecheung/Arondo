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

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const runnerId = runnerManager.resolveRunnerId(project.runnerId);
    if (!runnerId) {
      return NextResponse.json({ commits: [], error: "No runner" }, { status: 200 });
    }

    const result = await runnerManager.sendRequest(
      runnerId,
      "git.log",
      { workDir: project.repoPath, limit }
    );

    return NextResponse.json({
      commits: result.commits || [],
    });
  } catch (error: any) {
    console.error("Failed to get git log:", error);
    return NextResponse.json({
      commits: [],
      error: error.message,
    }, { status: 200 });
  }
}

export const dynamic = "force-dynamic";
