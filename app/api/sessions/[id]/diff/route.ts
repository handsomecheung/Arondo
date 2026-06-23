import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

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
    const runnerId = runnerManager.resolveRunnerId(session.runnerId);
    if (!runnerId) {
      return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
    }

    const result = await runnerManager.sendRequest(
      runnerId,
      "git.diff",
      { workDir: session.repoPath }
    );

    if (!result.hasChanges) {
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
    .container { text-align: center; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #24292f; }
  </style>
</head>
<body>
  <div class="container">
    <h1>No changes detected</h1>
    <p>All changes have been committed or there are no modifications.</p>
  </div>
</body>
</html>`;
      return new NextResponse(emptyHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Write raw diff to temp file, pipe through diff2html
    const DATA_DIR = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), "data");
    const sessionDir = path.join(DATA_DIR, "sessions", id);
    await fs.mkdir(sessionDir, { recursive: true });

    const diffPath = path.join(sessionDir, "tmp.diff");
    const htmlPath = path.join(sessionDir, "diff.html");
    await fs.writeFile(diffPath, result.diff, "utf-8");

    try {
      await execAsync(`diff2html -i file --file "${htmlPath}" -- "${diffPath}"`, {
        cwd: sessionDir,
      });
      const html = await fs.readFile(htmlPath, "utf-8");
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch {
      // diff2html not available — return raw diff as preformatted HTML
      const rawHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Diff</title>
<style>body{font-family:monospace;white-space:pre-wrap;padding:1em;background:#1e1e1e;color:#d4d4d4;}</style>
</head><body>${result.diff.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</body></html>`;
      return new NextResponse(rawHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } finally {
      fs.unlink(diffPath).catch(() => {});
      fs.unlink(htmlPath).catch(() => {});
    }
  } catch (error: any) {
    console.error("Failed to generate diff:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate diff" },
      { status: 500 }
    );
  }
}
