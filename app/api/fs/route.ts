import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

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

  const token = getArondoToken(request);
  if (!(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  if (!runnerManager.getRunner(runnerId)) {
    return NextResponse.json(
      { error: "Runner not found or disconnected" },
      { status: 503 }
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
      entries: result.entries,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to read directory" },
      { status: 500 }
    );
  }
}
