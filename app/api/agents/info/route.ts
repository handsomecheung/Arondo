import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

const CONFIG_DIR = getConfigDir();

export async function GET(req: NextRequest) {
  const runnerId = req.nextUrl.searchParams.get("runnerId");
  if (!runnerId) {
    return NextResponse.json({ claude: null, antigravity: null, codex: null });
  }

  const token = getArondoToken(req);
  if (!(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runnerPath = path.join(CONFIG_DIR, "runners", runnerId, "runner.json");
  const quotaPath = path.join(CONFIG_DIR, "autoagent", "agent", "quota.json");
  try {
    const [runnerRaw, quotaRaw] = await Promise.all([
      fs.readFile(runnerPath, "utf-8"),
      fs.readFile(quotaPath, "utf-8"),
    ]);
    const runner = JSON.parse(runnerRaw) as { agents?: Array<{ Type: string; Account: string; Plan: string }> };
    const quotas = JSON.parse(quotaRaw) as Record<string, unknown>;
    const result: Record<string, unknown> = { claude: null, antigravity: null, codex: null };
    for (const agent of runner.agents ?? []) {
      if (!(agent.Type in result)) continue;
      result[agent.Type] = quotas[`${agent.Type}_${agent.Account}_${agent.Plan}`] ?? null;
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ claude: null, antigravity: null, codex: null });
  }
}

export const dynamic = "force-dynamic";
