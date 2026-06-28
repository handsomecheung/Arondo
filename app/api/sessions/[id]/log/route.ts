import { NextRequest, NextResponse } from "next/server";
import { getSessionLog } from "@/lib/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");

  if (!messageId) {
    return NextResponse.json({ error: "messageId query parameter is required" }, { status: 400 });
  }

  const log = await getSessionLog(id === "global" ? "" : id, messageId);
  return NextResponse.json({ log });
}

export const dynamic = "force-dynamic";
