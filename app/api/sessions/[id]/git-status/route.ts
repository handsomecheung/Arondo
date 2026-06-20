import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
    // Check for any changes (staged, unstaged, untracked)
    const { stdout } = await execAsync("git status --porcelain", {
      cwd: session.repoPath,
    });
    
    const hasChanges = stdout.trim().length > 0;
    return NextResponse.json({ hasChanges });
  } catch (error: any) {
    console.error("Failed to check git status:", error);
    // If the path is not a git repo or git fails, default to false or return error
    return NextResponse.json({ hasChanges: false, error: error.message }, { status: 200 });
  }
}
