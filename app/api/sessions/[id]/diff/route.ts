import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionDiffs } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import * as Diff2Html from "diff2html";
import fs from "fs";
import path from "path";

let diff2htmlCss = "";
try {
  const cssPath = path.join(process.cwd(), "node_modules/diff2html/bundles/css/diff2html.min.css");
  diff2htmlCss = fs.readFileSync(cssPath, "utf8");
} catch (e) {
  console.warn("Failed to read diff2html css from node_modules, falling back to CDN:", e);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const wrap = searchParams.get("wrap") === "true";
  const messageId = searchParams.get("messageId");
  const filePath = searchParams.get("path");
  const projectId = searchParams.get("projectId") || undefined;

  if (messageId && filePath) {
    try {
      const diffs = await getSessionDiffs(id === "global" ? "" : id, messageId, projectId);
      const fileDiff = diffs[filePath];

      if (!fileDiff) {
        const emptyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>No Diff</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #f8fafc;
      color: #57606a;
    }
  </style>
</head>
<body>
  <div style="text-align:center;">No diff found for this file.</div>
</body>
</html>`;
        return new NextResponse(emptyHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const diffHtml = Diff2Html.html(fileDiff, {
        drawFileList: false,
        matching: "lines",
        outputFormat: "line-by-line",
      });

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Git Diff - ${path.basename(filePath)}</title>
  ${diff2htmlCss ? `<style>${diff2htmlCss}</style>` : `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />`}
  <style>
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f8fafc;
      color: #0f172a;
    }
    .d2h-wrapper {
      background-color: #ffffff;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
      padding: 10px;
      border: none !important;
    }
    .d2h-file-wrapper {
      border: 1px solid rgba(15, 23, 42, 0.08) !important;
      border-radius: 8px !important;
      margin-bottom: 20px !important;
      overflow: hidden;
    }
    .d2h-file-header {
      background-color: #f1f5f9 !important;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08) !important;
      padding: 3px 6px !important;
      height: auto !important;
      font-size: 10px !important;
    }
    .d2h-diff-table {
      font-size: 9px !important;
      line-height: 12px !important;
    }
    .d2h-code-line {
      line-height: 12px !important;
    }
    .d2h-code-line-ctn {
      padding-left: 4px !important;
    }
    .d2h-file-name {
      font-size: 10px !important;
    }
    ${wrap ? `
    .d2h-code-line-ctn {
      white-space: pre-wrap !important;
      word-break: break-all !important;
    }
    ` : ""}
    /* Maximize horizontal space on mobile devices */
    @media (max-width: 640px) {
      body {
        padding: 0 !important;
      }
      .d2h-wrapper {
        padding: 0 !important;
      }
      .d2h-file-wrapper {
        border-left: none !important;
        border-right: none !important;
        border-radius: 0 !important;
        margin-bottom: 10px !important;
      }
      .d2h-file-header {
        border-radius: 0 !important;
      }
    }
  </style>
</head>
<body>
  ${diffHtml}
</body>
</html>`;

      return new NextResponse(fullHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Failed to generate file diff" },
        { status: 500 }
      );
    }
  }

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
      background-color: #f8fafc;
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

    if (result.diff) {
      const diffHtml = Diff2Html.html(result.diff, {
        drawFileList: true,
        matching: "lines",
        outputFormat: "line-by-line",
      });

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Git Diff</title>
  ${diff2htmlCss ? `<style>${diff2htmlCss}</style>` : `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />`}
  <style>
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f8fafc;
      color: #0f172a;
    }
    .d2h-wrapper {
      background-color: #ffffff;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
      padding: 10px;
      border: none !important;
    }
    .d2h-file-wrapper {
      border: 1px solid rgba(15, 23, 42, 0.08) !important;
      border-radius: 8px !important;
      margin-bottom: 20px !important;
      overflow: hidden;
    }
    .d2h-file-header {
      background-color: #f1f5f9 !important;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08) !important;
      padding: 3px 6px !important;
      height: auto !important;
      font-size: 10px !important;
    }
    .d2h-diff-table {
      font-size: 9px !important;
      line-height: 12px !important;
    }
    .d2h-code-line {
      line-height: 12px !important;
    }
    .d2h-code-line-ctn {
      padding-left: 4px !important;
    }
    .d2h-file-name {
      font-size: 10px !important;
    }
    .d2h-file-list-title {
      font-size: 11px !important;
    }
    /* Maximize horizontal space on mobile devices */
    @media (max-width: 640px) {
      body {
        padding: 0 !important;
      }
      .d2h-wrapper {
        padding: 0 !important;
      }
      .d2h-file-wrapper {
        border-left: none !important;
        border-right: none !important;
        border-radius: 0 !important;
        margin-bottom: 10px !important;
      }
      .d2h-file-header {
        border-radius: 0 !important;
      }
    }
    ${wrap ? `
    .d2h-code-line-ctn {
      white-space: pre-wrap !important;
      word-break: break-all !important;
    }
    ` : ""}
  </style>
</head>
<body>
  ${diffHtml}
</body>
</html>`;

      return new NextResponse(fullHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Fallback: diff2html not available or error — return raw diff as preformatted HTML
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
