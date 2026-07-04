import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const runnerId: string | undefined = body.runner;
  const paths: string[] = Array.isArray(body.paths) ? body.paths : [];

  if (!runnerId) {
    return NextResponse.json(
      { error: "runner is required" },
      { status: 400 }
    );
  }

  if (!runnerManager.getRunner(runnerId)) {
    return NextResponse.json(
      { error: "Runner not found or disconnected" },
      { status: 503 }
    );
  }

  if (paths.length === 0) {
    return NextResponse.json({ results: {} });
  }

  try {
    const result = await runnerManager.sendRequest(
      runnerId,
      "fs.infos",
      { paths }
    );

    return NextResponse.json({ results: result.results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to get path infos" },
      { status: 500 }
    );
  }
}
