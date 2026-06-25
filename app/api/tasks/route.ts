import { NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";

export async function GET() {
  const tasks = runnerManager.getAllTasks();
  return NextResponse.json(tasks);
}

export const dynamic = "force-dynamic";
