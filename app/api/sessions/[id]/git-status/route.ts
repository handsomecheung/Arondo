import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const runnerId = runnerManager.resolveRunnerId(session.runnerId);
    if (!runnerId) {
      return NextResponse.json({ hasChanges: false, isGitRepo: false, error: "No runner" }, { status: 200 });
    }

    const result = await runnerManager.sendRequest(
      runnerId,
      "git.status",
      { workDir: session.repoPath }
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
