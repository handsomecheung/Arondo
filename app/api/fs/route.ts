import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path") || "/";
  const runnerId = searchParams.get("runner");

  if (!runnerId) {
    return NextResponse.json(
      { error: "runner query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const result = await runnerManager.sendRequest(
      runnerId,
      "fs.list",
      { path: requestedPath }
    );

    return NextResponse.json({
      currentPath: result.currentPath,
      parentPath: result.parentPath,
      directories: result.directories,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to read directory" },
      { status: 500 }
    );
  }
}
