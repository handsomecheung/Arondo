import { NextRequest, NextResponse } from "next/server";
import { getSessionDiffs } from "@/lib/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;
  const filePath = searchParams.get("path");

  if (!messageId) {
    return NextResponse.json({ error: "messageId query parameter is required" }, { status: 400 });
  }

  const diffs = await getSessionDiffs(id === "global" ? "" : id, messageId, projectId);
  
  if (filePath) {
    return NextResponse.json({ diff: diffs[filePath] || "" });
  }

  return NextResponse.json({ diffs });
}

export const dynamic = "force-dynamic";
