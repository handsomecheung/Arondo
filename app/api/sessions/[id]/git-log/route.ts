import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifySessionPermission } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);

  if (!(await verifySessionPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const runnerId = runnerManager.resolveRunnerId(session.runnerId);
    if (!runnerId) {
      return NextResponse.json({ commits: [], error: "No runner" }, { status: 200 });
    }

    const result = await runnerManager.sendRequest(
      runnerId,
      "git.log",
      { workDir: session.repoPath, limit }
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
