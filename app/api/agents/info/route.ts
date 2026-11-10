import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

const CONFIG_DIR = getConfigDir();

export async function GET(req: NextRequest) {
  const runnerId = req.nextUrl.searchParams.get("runnerId");
  if (!runnerId) {
    return NextResponse.json({ claude: null, antigravity: null, codex: null, opencode: null, pi: null });
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
    const runner = JSON.parse(runnerRaw) as {
      agents?: string[];
      quotaAgents?: Array<{ Type: string; Account: string; Plan: string }>;
    };
    const quotas = JSON.parse(quotaRaw) as Record<string, unknown>;
    const result: Record<string, unknown> = { claude: null, antigravity: null, codex: null, opencode: null, pi: null };
    for (const agent of runner.quotaAgents ?? []) {
      if (!(agent.Type in result)) continue;
      const found = quotas[`${agent.Type}_${agent.Account}_${agent.Plan}`];
      result[agent.Type] = found ?? { Account: agent.Account, Plan: agent.Plan };
    }
    const runnerConn = runnerManager.getRunner(runnerId);
    const agents = runnerConn?.info.agents ?? runner.agents ?? [];
    if (agents.includes("pi")) {
      result.pi = { Account: "", Plan: "", IsAPIKey: true };
    }
    return NextResponse.json(result);
  } catch {
    const hasPi = runnerManager.getRunner(runnerId)?.info.agents?.includes("pi");
    return NextResponse.json({
      claude: null,
      antigravity: null,
      codex: null,
      opencode: null,
      pi: hasPi ? { Account: "", Plan: "", IsAPIKey: true } : null,
    });
  }
}

export const dynamic = "force-dynamic";
