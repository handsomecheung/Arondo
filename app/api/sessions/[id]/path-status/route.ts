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

  if (session.noProject || !session.repoPath) {
    return NextResponse.json({ exists: true, runnerConnected: true });
  }

  const runner = runnerManager.getRunner(session.runnerId);
  if (!runner) {
    return NextResponse.json({ exists: true, runnerConnected: false });
  }

  const exists = await runnerManager.checkPathExists(session.runnerId, session.repoPath);
  return NextResponse.json({ exists, runnerConnected: true });
}

export const dynamic = "force-dynamic";
