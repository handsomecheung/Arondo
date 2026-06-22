import { NextRequest, NextResponse } from "next/server";
import { controllerManager } from "@/lib/controller-manager";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path") || "/";
  const controllerId = searchParams.get("controller");

  if (!controllerId) {
    return NextResponse.json(
      { error: "controller query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const result = await controllerManager.sendRequest(
      controllerId,
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
