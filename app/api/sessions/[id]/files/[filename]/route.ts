import { NextRequest, NextResponse } from "next/server";
import { handleSessionFileRequest } from "@/lib/session-files";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  if (!id || !filename) {
    return NextResponse.json({ error: "Session ID and filename are required" }, { status: 400 });
  }

  const decodedFilename = decodeURIComponent(filename);
  return handleSessionFileRequest(req, id, decodedFilename);
}

export const dynamic = "force-dynamic";
