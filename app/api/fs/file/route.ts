import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const runnerId = searchParams.get("runner");

  if (!runnerId) {
    return NextResponse.json({ error: "runner query parameter is required" }, { status: 400 });
  }
  if (!filePath) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  if (!runnerManager.getRunner(runnerId)) {
    return NextResponse.json({ error: "Runner not found or disconnected" }, { status: 503 });
  }

  try {
    const result = await runnerManager.sendRequest(runnerId, "fs.read", { path: filePath });
    return NextResponse.json({
      path: result.path,
      content: result.content,
      size: result.size,
    });
  } catch (error: any) {
    const status = error.message?.includes("TOO_LARGE") ? 413
      : error.message?.includes("NOT_FOUND") ? 404
      : 500;
    return NextResponse.json({ error: error.message || "Failed to read file" }, { status });
  }
}
