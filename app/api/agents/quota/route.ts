import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, isValidToken, verifyRunnerPermission } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";

const QUOTA_AGENTS: Record<string, string> = {
  claude: "claude",
  agy: "antigravity",
  codex: "codex",
};
const QUOTA_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const lastQuotaRefreshAt = new Map<string, number>();

function requestQuotaRefresh(runnerId: string, agentBinary: string): boolean {
  const key = `${runnerId}:${agentBinary}`;
  const now = Date.now();
  const lastRefreshAt = lastQuotaRefreshAt.get(key);
  if (lastRefreshAt != null && now - lastRefreshAt < QUOTA_REFRESH_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil(
      (QUOTA_REFRESH_COOLDOWN_MS - (now - lastRefreshAt)) / 1000,
    );
    console.log(
      `[quota-refresh] skipped ${agentBinary} for runner ${runnerId}; ${remainingSeconds}s cooldown remaining`,
    );
    return false;
  }
  lastQuotaRefreshAt.set(key, now);
  runnerManager.sendFire(runnerId, "info.fetch", { agent: agentBinary });
  return true;
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runners = await runnerManager.getAllKnownRunners();
  const requested: Array<{ runnerId: string; agent: string }> = [];
  let body: { runnerId?: unknown; agent?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // A request without a body retains the CLI's existing all-runner behavior.
  }

  const runnerId = typeof body.runnerId === "string" ? body.runnerId : null;
  const agentBinary = typeof body.agent === "string" ? body.agent : null;
  if (runnerId || agentBinary) {
    if (!runnerId || !agentBinary || !QUOTA_AGENTS[agentBinary]) {
      return NextResponse.json({ error: "Invalid runnerId or agent" }, { status: 400 });
    }

    const runner = runners.find((candidate) => candidate.id === runnerId);
    if (!runner) {
      return NextResponse.json({ error: "Runner not found" }, { status: 404 });
    }
    if (!(await verifyRunnerPermission(runnerId, token))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!runner.connected) {
      return NextResponse.json({ error: "Runner is disconnected" }, { status: 409 });
    }
    if (!runner.agentBinaries.includes(agentBinary)) {
      return NextResponse.json({ error: "Agent is not installed on this runner" }, { status: 400 });
    }

    const agent = QUOTA_AGENTS[agentBinary];
    if (requestQuotaRefresh(runner.id, agentBinary)) {
      requested.push({ runnerId: runner.id, agent });
    }
    return NextResponse.json({ requested, cooldown: requested.length === 0 });
  }

  if (getRoleByToken(token) !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  for (const runner of runners) {
    if (!runner.connected) {
      continue;
    }
    for (const binary of runner.agentBinaries) {
      const agent = QUOTA_AGENTS[binary];
      if (!agent) continue;
      if (requestQuotaRefresh(runner.id, binary)) {
        requested.push({ runnerId: runner.id, agent });
      }
    }
  }

  return NextResponse.json({ requested });
}

export const dynamic = "force-dynamic";
