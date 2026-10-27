import { NextRequest, NextResponse } from "next/server";
import { getSessionHtml, saveSessionHtml, saveSessionDiffs, getMessages, getSessionLog } from "@/lib/store";
import { getArondoToken, verifySessionPermission, verifyProjectPermission, isValidToken } from "@/lib/auth";
import { renderMarkdownHtml, RENDERED_HTML_CACHE_MARKER } from "@/lib/renderHtml";

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
  if (!html) {
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
        const rendered = renderMarkdownHtml(log);
        html = `${RENDERED_HTML_CACHE_MARKER}${rendered}`;
        await saveSessionHtml(sessId, targetMessageId, html, projectId);
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
