import { NextRequest, NextResponse } from "next/server";
import { getSessionDiffs } from "@/lib/store";
import { getArondoToken, verifySessionPermission, verifyProjectPermission, isValidToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;
  const filePath = searchParams.get("path");

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

  const diffs = await getSessionDiffs(id === "global" ? "" : id, messageId, projectId);
  
  if (filePath) {
    return NextResponse.json({ diff: diffs[filePath] || "" });
  }

  return NextResponse.json({ diffs });
}

export const dynamic = "force-dynamic";
