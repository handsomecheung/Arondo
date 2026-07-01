import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";


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

    if (result.html) {
      return new NextResponse(result.html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // diff2html not available on runner — return raw diff as preformatted HTML
    const rawHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Diff</title>
<style>body{font-family:monospace;white-space:pre-wrap;padding:1em;background:#f8fafc;color:#0f172a;}</style>
</head><body>${result.diff.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</body></html>`;
    return new NextResponse(rawHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Failed to generate diff:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate diff" },
      { status: 500 }
    );
  }
}
