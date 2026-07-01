import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { runnerManager } from "../../../lib/runner-manager";
import { getConfigDir } from "../../../lib/config";

const CONFIG_DIR = getConfigDir();
const GLOBAL_RULES_FILE = path.join(CONFIG_DIR, "global-rules.md");

export async function GET() {
  try {
    const content = await fs.readFile(GLOBAL_RULES_FILE, "utf-8");
    return NextResponse.json({ content });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return NextResponse.json({ content: "" });
    }
    return NextResponse.json({ error: "Failed to read global rules" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { content } = await request.json();
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(GLOBAL_RULES_FILE, content, "utf-8");

    const runners = runnerManager.getRunners();
    for (const runner of runners) {
      if (runner.connected) {
        runnerManager.syncGlobalRulesToRunner(runner.id).catch((err) => {
          console.error(`Failed to sync global rules to runner ${runner.id} after update:`, err);
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to save global rules" }, { status: 500 });
  }
}
