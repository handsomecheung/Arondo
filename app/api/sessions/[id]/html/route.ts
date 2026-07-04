import { NextRequest, NextResponse } from "next/server";
import { getSessionHtml, saveSessionHtml, saveSessionDiffs } from "@/lib/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;

  if (!messageId) {
    return NextResponse.json({ error: "messageId query parameter is required" }, { status: 400 });
  }

  const html = await getSessionHtml(id === "global" ? "" : id, messageId, projectId);
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
