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

  const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  const sessionDir = path.join(DATA_DIR, "sessions", id);

  try {
    // Ensure session directory exists
    await fs.mkdir(sessionDir, { recursive: true });

    // Get current commit ID of HEAD
    let commitId = "initial";
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: session.repoPath,
      });
      commitId = stdout.trim();
    } catch (e) {
      console.warn("Failed to get HEAD commit ID, using fallback 'initial'", e);
    }

    const diffHtmlPath = path.join(sessionDir, `${commitId}.html`);

    // Check if the file already exists
    let fileExists = false;
    try {
      await fs.access(diffHtmlPath);
      fileExists = true;
    } catch {
      // File does not exist
    }

    // If file does not exist, generate it
    if (!fileExists) {
      // Generate diff.html using git and diff2html
      // We capture both unstaged changes (git diff) and the latest commit (git diff HEAD~1)
      const cmd = `(git diff HEAD~1 2>/dev/null || true; git diff) | diff2html -i stdin -f html --file "${diffHtmlPath}"`;
      
      await execAsync(cmd, {
        cwd: session.repoPath,
      });

      // Clean up old diff HTML files
      try {
        const files = await fs.readdir(sessionDir);
        for (const file of files) {
          if (file.endsWith(".html") && file !== `${commitId}.html`) {
            await fs.unlink(path.join(sessionDir, file));
          }
        }
      } catch (cleanupError) {
        console.warn("Failed to clean up old diff HTML files:", cleanupError);
      }
    }

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
