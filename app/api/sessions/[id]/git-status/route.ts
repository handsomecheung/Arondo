import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { controllerManager } from "@/lib/controller-manager";

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
    const controllerId = controllerManager.resolveControllerId(session.controllerId);
    if (!controllerId) {
      return NextResponse.json({ hasChanges: false, isGitRepo: false, error: "No controller" }, { status: 200 });
    }

    const result = await controllerManager.sendRequest(
      controllerId,
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
