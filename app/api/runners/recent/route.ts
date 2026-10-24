import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken, recordRunnerUse } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runnerId } = await request.json();
  if (typeof runnerId !== "string" || !runnerId) {
    return NextResponse.json({ error: "runnerId is required" }, { status: 400 });
  }
  if (!(await runnerManager.isTokenAllowedForRunnerId(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await recordRunnerUse(token, runnerId);
  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
