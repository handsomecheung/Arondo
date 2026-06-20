import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
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

  const sessionDir = path.join(process.cwd(), "data", "sessions", id);
  const diffHtmlPath = path.join(sessionDir, "diff.html");

  try {
    // Ensure session directory exists
    await fs.mkdir(sessionDir, { recursive: true });

    // Generate diff.html using git and diff2html
    // We capture both unstaged changes (git diff) and the latest commit (git diff HEAD~1)
    const cmd = `(git diff HEAD~1 2>/dev/null || true; git diff) | diff2html -i stdin -f html --file "${diffHtmlPath}"`;
    
    await execAsync(cmd, {
      cwd: session.repoPath,
    });

    // Read the generated HTML file
    const htmlContent = await fs.readFile(diffHtmlPath, "utf-8");

    // Return the HTML directly to be rendered by the browser
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("Failed to generate or serve diff HTML:", error);
    return NextResponse.json({ error: error.message || "Failed to generate diff" }, { status: 500 });
  }
}
