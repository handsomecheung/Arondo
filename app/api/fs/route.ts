import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";
import { getShowHiddenFiles } from "@/lib/store";

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
    const showHidden = await getShowHiddenFiles();
    const result = await runnerManager.sendRequest(
      runnerId,
      "fs.list",
      { path: requestedPath, showHidden }
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

export async function POST(request: NextRequest) {
  let body: { runnerId?: string; parentPath?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { runnerId, parentPath, name } = body;
  if (!runnerId || !parentPath || !name) {
    return NextResponse.json(
      { error: "runnerId, parentPath, and name are required" },
      { status: 400 }
    );
  }

  const token = getArondoToken(request);
  if (!(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!runnerManager.getRunner(runnerId)) {
    return NextResponse.json(
      { error: "Runner not found or disconnected" },
      { status: 503 }
    );
  }

  try {
    const result = await runnerManager.sendRequest(runnerId, "fs.mkdir", { parentPath, name });
    return NextResponse.json({ path: result.path });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create directory" },
      { status: 500 }
    );
  }
}
