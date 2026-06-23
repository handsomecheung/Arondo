import { NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET() {
  const runners = runnerManager.getRunners();
  return NextResponse.json(runners);
}

export const dynamic = "force-dynamic";
