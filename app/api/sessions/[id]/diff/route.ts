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

    // We check git diff HEAD output first (or fallback to git diff if HEAD doesn't exist)
    // We append "-- ." to restrict changes to the project directory (session.repoPath)
    let hasChanges = false;
    let diffCmd = "git diff HEAD -- .";
    try {
      const { stdout } = await execAsync("git diff HEAD -- .", {
        cwd: session.repoPath,
      });
      if (stdout.trim().length > 0) {
        hasChanges = true;
      }
    } catch (e) {
      console.warn("Failed to check git diff HEAD, falling back to git diff", e);
      diffCmd = "git diff -- .";
      try {
        const { stdout } = await execAsync("git diff -- .", {
          cwd: session.repoPath,
        });
        if (stdout.trim().length > 0) {
          hasChanges = true;
        }
      } catch (e2) {
        console.warn("Failed to check fallback git diff", e2);
      }
    }

    if (hasChanges) {
      // Generate diff.html using git and diff2html
      const cmd = `${diffCmd} | diff2html -i stdin -f html --file "${diffHtmlPath}"`;
      await execAsync(cmd, {
        cwd: session.repoPath,
      });
    } else {
      // Generate simple empty HTML
      const emptyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>No Changes</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #f6f8fa;
      color: #57606a;
    }
    .container {
      text-align: center;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #24292f;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>No changes detected</h1>
    <p>All changes have been committed or there are no modifications.</p>
  </div>
</body>
</html>`;
      await fs.writeFile(diffHtmlPath, emptyHtml, "utf-8");
    }

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
