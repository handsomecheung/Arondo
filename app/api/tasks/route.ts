import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { isSessionArchived } from "@/lib/store";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tasks = runnerManager.getAllTasks();

  const filtered = [];
  for (const task of tasks) {
    if (task.sessionId && isSessionArchived(task.sessionId)) {
      continue;
    }
    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(task.runnerId, token);
    if (isAllowed) {
      filtered.push(task);
    }
  }

  return NextResponse.json(filtered);
}

export const dynamic = "force-dynamic";
