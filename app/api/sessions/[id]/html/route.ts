import { NextRequest, NextResponse } from "next/server";
import { getSessionHtml, saveSessionHtml, saveSessionDiffs, getMessages, getSessionLog, getSession, getProject } from "@/lib/store";
import { getArondoToken, verifySessionPermission, verifyProjectPermission, isValidToken } from "@/lib/auth";
import { renderMarkdownHtml, RENDERED_HTML_CACHE_MARKER, PathInfoMap } from "@/lib/renderHtml";
import { extractCandidatePaths, candidateToPath, safeDecodeURIComponent } from "@/lib/remarkFileLinks";
import { resolveRepoFilePath } from "@/lib/homeUtils";
import { stripAnsi } from "@/lib/ansi";
import { runnerManager } from "@/lib/runner-manager";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;

  const token = getArondoToken(req);
  if (id === "global") {
    if (projectId) {
      if (!(await verifyProjectPermission(projectId, token))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      if (!isValidToken(token)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    if (!(await verifySessionPermission(id, token))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let targetMessageId = messageId;
  if (!targetMessageId && id !== "global") {
    const messages = await getMessages(id, projectId);
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "agent-run" || messages[i].type === "detached-agent-run" || messages[i].type === "script-run") {
        targetMessageId = messages[i].id;
        break;
      }
    }
  }

  if (!targetMessageId) {
    return NextResponse.json({ error: "messageId query parameter is required" }, { status: 400 });
  }

  const sessId = id === "global" ? "" : id;
  let html = await getSessionHtml(sessId, targetMessageId, projectId);
  const hasLegacyEmptyFileLink = html.includes('<a href="">');
  if (!html || !html.includes(RENDERED_HTML_CACHE_MARKER) || hasLegacyEmptyFileLink) {
    const messages = await getMessages(sessId, projectId);
    const message = messages.find((entry) => entry.id === targetMessageId);
    const kind = message?.type === "script-run"
      ? "script"
      : message?.type === "agent-run" || message?.type === "detached-agent-run"
        ? "agent"
        : undefined;
    if (kind) {
      const log = await getSessionLog(sessId, targetMessageId, kind, projectId, "stdout");
      if (log) {
        const cleanLog = stripAnsi(log);
        const candidates = extractCandidatePaths(cleanLog);
        const pathInfos: PathInfoMap = {};
        const diffMap: Record<string, string> = {};
        let canCache = true;

        const session = sessId ? await getSession(sessId) : undefined;
        if (session?.status === "running") {
          canCache = false;
        }

        if (candidates.length > 0) {
          const project = !session && projectId ? await getProject(projectId) : undefined;
          const runnerId = session?.runnerId ?? project?.runnerId;
          const repoPath = session?.repoPath ?? project?.repoPath;

          const absPaths = candidates.map((c) => {
            const rawPath = candidateToPath(c);
            const decoded = safeDecodeURIComponent(rawPath);
            return decoded.startsWith("/") ? decoded : (repoPath ? resolveRepoFilePath(repoPath, decoded) : decoded);
          });

          if (runnerId && runnerManager.getRunner(runnerId)) {
            try {
              const result = await runnerManager.sendRequest(runnerId, "fs.infos", { paths: absPaths });
              const results = result?.results as Record<string, { exists: boolean; diff?: string }> | undefined;
              if (results) {
                candidates.forEach((c, i) => {
                  const res = results[absPaths[i]];
                  if (res && res.exists) {
                    const cleanPath = candidateToPath(c);
                    const infoObj = { exists: true, diff: res.diff };
                    pathInfos[cleanPath] = infoObj;
                    pathInfos[c] = infoObj;
                    if (res.diff) {
                      diffMap[absPaths[i]] = res.diff;
                    }
                  }
                });
                if (canCache && Object.keys(diffMap).length > 0) {
                  await saveSessionDiffs(sessId, targetMessageId, diffMap, projectId);
                }
              } else {
                canCache = false;
              }
            } catch {
              canCache = false;
            }
          } else {
            canCache = false;
          }
        }

        const rendered = renderMarkdownHtml(log, pathInfos);
        if (canCache) {
          html = `${RENDERED_HTML_CACHE_MARKER}${rendered}`;
          await saveSessionHtml(sessId, targetMessageId, html, projectId);
        } else {
          html = rendered;
        }
      }
    }
  }

  return NextResponse.json({ html });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;

  const token = getArondoToken(req);
  if (id === "global") {
    if (projectId) {
      if (!(await verifyProjectPermission(projectId, token))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      if (!isValidToken(token)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    if (!(await verifySessionPermission(id, token))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!messageId) {
    return NextResponse.json({ error: "messageId query parameter is required" }, { status: 400 });
  }

  try {
    const { html, diffs } = await req.json();
    if (typeof html !== "string") {
      return NextResponse.json({ error: "html body parameter is required" }, { status: 400 });
    }

    const sessId = id === "global" ? "" : id;
    await saveSessionHtml(sessId, messageId, html, projectId);
    
    if (diffs && typeof diffs === "object") {
      await saveSessionDiffs(sessId, messageId, diffs, projectId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to save HTML" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
