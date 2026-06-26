import { NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET() {
  const runners = await runnerManager.getAllKnownRunners();
  return NextResponse.json(runners);
}

export const dynamic = "force-dynamic";
