import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET() {
  const runners = await runnerManager.getAllKnownRunners();
  return NextResponse.json(runners);
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing runner id" }, { status: 400 });
    }
    const success = await runnerManager.deleteRunner(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete runner" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
