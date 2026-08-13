import { NextRequest, NextResponse } from "next/server";
import { getArchivedSessionPaths } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, isValidToken } from "@/lib/auth";
import fs from "fs/promises";

// Helper to load only the minimal necessary metadata from each session file
async function readSessionMetadata(filePath: string): Promise<{ runnerId: string } | null> {
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

  const filePaths = await getArchivedSessionPaths();

  for (const filePath of filePaths) {
    const session = await readSessionMetadata(filePath);
    if (session && session.runnerId) {
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
