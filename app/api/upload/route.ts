import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const runnerId = formData.get("runner");

  if (!(file instanceof File) || typeof runnerId !== "string" || !runnerId) {
    return NextResponse.json(
      { error: "file and runner are required" },
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

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB)` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("base64");

  try {
    const result = await runnerManager.sendRequest(
      runnerId,
      "fs.upload",
      { filename: file.name, content },
      60_000
    );

    return NextResponse.json({ path: result.path, dir: result.dir });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
