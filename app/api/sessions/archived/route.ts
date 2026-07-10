import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessions } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await getArchivedSessions();
  const valid: typeof sessions = [];
  for (const session of sessions) {
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(session.runnerId, token);
    if (isAllowed) valid.push(session);
  }

  return NextResponse.json(valid);
}

export const dynamic = "force-dynamic";
