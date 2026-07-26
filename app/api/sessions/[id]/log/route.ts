import { NextRequest, NextResponse } from "next/server";
import { getSessionLog } from "@/lib/store";
import { getArondoToken, verifySessionPermission, verifyProjectPermission, isValidToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const projectId = searchParams.get("projectId") || undefined;
  const streamParam = searchParams.get("stream");

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

  const stream = streamParam === "stderr" ? "stderr" : "stdout";
  const log = await getSessionLog(id === "global" ? "" : id, messageId, projectId, stream);
  return NextResponse.json({ log });
}

export const dynamic = "force-dynamic";
