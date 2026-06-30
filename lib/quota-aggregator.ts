import fs from "fs/promises";
import path from "path";
import { runnerManager } from "./runner-manager";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

const AGENTS_DIR = path.join(DATA_DIR, "agents");
const OUTPUT_PATH = path.join(DATA_DIR, "autoselect", "agent", "quota.json");
const STALE_THRESHOLD_S = 60 * 60; // 1 hour

const AGENT_TYPES = ["claude", "antigravity"] as const;

// Maps runner binary name → agent file type (used as filename stem and Type field).
const BINARY_TO_AGENT_TYPE: Record<string, string> = {
  claude: "claude",
  agy: "antigravity",
};

// Maps quota Type → runner binary name (inverse of BINARY_TO_AGENT_TYPE).
const TYPE_TO_BINARY: Record<string, string> = {
  claude: "claude",
  antigravity: "agy",
};

type QuotaEntry = Record<string, unknown> & {
  Type: string;
  Account: string;
  Plan: string;
  updatedAt: number;
};

function makeKey(type: string, account: string, plan: string): string {
  return `${type}_${account}_${plan}`;
}

async function readAgentFile(
  runnerId: string,
  agentType: string
): Promise<QuotaEntry | null> {
  const filePath = path.join(AGENTS_DIR, runnerId, `${agentType}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.Account || !data.Plan) return null;
    return {
      ...data,
      Type: agentType,
      Account: data.Account as string,
      Plan: data.Plan as string,
      updatedAt: (data.updatedAt as number) ?? 0,
    };
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Checks every connected runner's installed agents. For each (runner, agentType)
// pair that has no data file on disk, sends an info.fetch request to that runner.
// Returns true if at least one request was sent.
async function requestMissingEntries(): Promise<boolean> {
  const connectedRunners = runnerManager.getRunners().filter((r) => r.connected);
  let sent = false;

  for (const runner of connectedRunners) {
    for (const binary of runner.agents) {
      const agentType = BINARY_TO_AGENT_TYPE[binary];
      if (!agentType) continue;

      const filePath = path.join(AGENTS_DIR, runner.id, `${agentType}.json`);
      if (await fileExists(filePath)) continue;

      runnerManager.sendFire(runner.id, "info.fetch", { agent: binary });
      console.log(
        `[quota-aggregator] missing ${agentType} data for runner ${runner.id} — requested info.fetch`
      );
      sent = true;
    }
  }

  return sent;
}

// For each aggregated entry whose updatedAt is older than STALE_THRESHOLD_S,
// picks one connected runner at random (among those with the agent installed)
// and sends an info.fetch request.
function requestStaleRefreshes(merged: Record<string, QuotaEntry>): void {
  const now = Math.floor(Date.now() / 1000);
  const connectedRunners = runnerManager.getRunners().filter((r) => r.connected);
  if (connectedRunners.length === 0) return;

  // Deduplicate by binary: send at most one request per binary type.
  const sentBinaries = new Set<string>();

  for (const entry of Object.values(merged)) {
    if (now - entry.updatedAt <= STALE_THRESHOLD_S) continue;

    const binary = TYPE_TO_BINARY[entry.Type];
    if (!binary || sentBinaries.has(binary)) continue;

    const capable = connectedRunners.filter((r) => r.agents.includes(binary));
    if (capable.length === 0) continue;

    const chosen = capable[Math.floor(Math.random() * capable.length)];
    runnerManager.sendFire(chosen.id, "info.fetch", { agent: binary });
    sentBinaries.add(binary);
    console.log(
      `[quota-aggregator] stale ${entry.Type} (key: ${makeKey(entry.Type, entry.Account, entry.Plan)}) — requested info.fetch from runner ${chosen.id}`
    );
  }
}

export async function aggregateQuota(): Promise<void> {
  let runnerIds: string[];
  try {
    const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
    runnerIds = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    runnerIds = [];
  }

  const merged: Record<string, QuotaEntry> = {};

  for (const runnerId of runnerIds) {
    for (const agentType of AGENT_TYPES) {
      const entry = await readAgentFile(runnerId, agentType);
      if (!entry) continue;

      const key = makeKey(entry.Type, entry.Account, entry.Plan);
      const existing = merged[key];
      if (!existing || entry.updatedAt > existing.updatedAt) {
        merged[key] = entry;
      }
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`[quota-aggregator] written ${Object.keys(merged).length} entries to ${OUTPUT_PATH}`);

  // Missing entries take priority: if any runner is missing data files for its
  // installed agents, request those first and skip the stale check this cycle.
  if (await requestMissingEntries()) return;

  requestStaleRefreshes(merged);
}

export function startQuotaAggregator(): void {
  aggregateQuota().catch((err) =>
    console.error("[quota-aggregator] initial run failed:", err)
  );
  setInterval(() => {
    aggregateQuota().catch((err) =>
      console.error("[quota-aggregator] periodic run failed:", err)
    );
  }, 5 * 60 * 1000);
}
