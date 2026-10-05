import { NextRequest, NextResponse } from "next/server";
import { handleSessionFileRequest } from "@/lib/session-files";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filename = req.nextUrl.searchParams.get("file") || req.nextUrl.searchParams.get("name");
  if (!id || !filename) {
    return NextResponse.json({ error: "Session ID and file query parameter are required" }, { status: 400 });
  }

  return handleSessionFileRequest(req, id, filename);
}

export const dynamic = "force-dynamic";
