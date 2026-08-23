import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

const QUOTA_AGENTS: Record<string, string> = {
  claude: "claude",
  agy: "antigravity",
  codex: "codex",
};

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runners = await runnerManager.getAllKnownRunners();
  const requested: Array<{ runnerId: string; agent: string }> = [];

  for (const runner of runners) {
    if (!runner.connected || !(await runnerManager.isTokenAllowedForRunner(runner, token))) {
      continue;
    }
    for (const binary of runner.agents) {
      const agent = QUOTA_AGENTS[binary];
      if (!agent) continue;
      runnerManager.sendFire(runner.id, "info.fetch", { agent: binary });
      requested.push({ runnerId: runner.id, agent });
    }
  }

  return NextResponse.json({ requested });
}

export const dynamic = "force-dynamic";
