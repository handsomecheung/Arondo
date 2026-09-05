import fs from "fs/promises";
import path from "path";
import { runnerManager } from "./runner-manager";
import { getConfigDir } from "./config";

const CONFIG_DIR = getConfigDir();
const OUTPUT_PATH = path.join(CONFIG_DIR, "autoagent", "agent", "quota.json");
const STALE_THRESHOLD_S = 60 * 60;
const INITIAL_FETCH_INTERVAL_MS = 60 * 1000;
const TYPE_TO_BINARY: Record<string, string> = { claude: "claude", antigravity: "agy", codex: "codex" };
const BINARY_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_BINARY).map(([type, binary]) => [binary, type]),
);

type QuotaEntry = Record<string, unknown> & {
  Type: string;
  Account: string;
  Plan: string;
  updatedAt: number;
  IsAPIKey?: boolean;
};

function makeKey(type: string, account: string, plan: string): string {
  return `${type}_${account}_${plan}`;
}

async function readQuotaEntries(): Promise<Record<string, QuotaEntry>> {
  try {
    return JSON.parse(await fs.readFile(OUTPUT_PATH, "utf-8"));
  } catch {
    return {};
  }
}

interface InitialFetchRequest {
  runnerId: string;
  agent: string;
}

const initialFetchQueue: InitialFetchRequest[] = [];
const queuedInitialFetches = new Set<string>();
let initialFetchTimer: ReturnType<typeof setTimeout> | null = null;

function initialFetchKey(request: InitialFetchRequest): string {
  return `${request.runnerId}:${request.agent}`;
}

function drainInitialFetchQueue(): void {
  initialFetchTimer = null;
  const request = initialFetchQueue.shift();
  if (!request) return;

  queuedInitialFetches.delete(initialFetchKey(request));
  const runner = runnerManager.getRunner(request.runnerId);
  if (runner && runner.info.connected && runner.info.agentBinaries.includes(request.agent)) {
    runnerManager.sendFire(request.runnerId, "info.fetch", { agent: request.agent });
    console.log(`[quota-aggregator] initial ${request.agent} quota request sent to runner ${request.runnerId}`);
  }

  if (initialFetchQueue.length > 0) {
    initialFetchTimer = setTimeout(drainInitialFetchQueue, INITIAL_FETCH_INTERVAL_MS);
  }
}

function queueInitialFetches(): void {
  const candidates = runnerManager.getRunners()
    .filter((runner) => runner.connected)
    .map((runner) => ({
      runnerId: runner.id,
      agents: runner.agentBinaries.filter((agent) => {
        const type = BINARY_TO_TYPE[agent];
        return type && !runner.agents.some((entry) => entry.Type === type);
      }),
    }));

  // Interleave runners so a runner with several agents does not delay every
  // other runner's initial quota discovery.
  const longestAgentList = Math.max(0, ...candidates.map((candidate) => candidate.agents.length));
  for (let index = 0; index < longestAgentList; index++) {
    for (const candidate of candidates) {
      const agent = candidate.agents[index];
      if (!agent) continue;
      const request = { runnerId: candidate.runnerId, agent };
      const key = initialFetchKey(request);
      if (queuedInitialFetches.has(key)) continue;
      queuedInitialFetches.add(key);
      initialFetchQueue.push(request);
    }
  }

  if (!initialFetchTimer && initialFetchQueue.length > 0) {
    drainInitialFetchQueue();
  }
}

// Only entries that an online runner explicitly references can be refreshed.
// A single randomly selected referencing runner performs the request.
async function requestStaleRefreshes(): Promise<void> {
  const entries = await readQuotaEntries();
  const onlineRunners = runnerManager.getRunners().filter((runner) => runner.connected);
  const now = Math.floor(Date.now() / 1000);

  for (const [key, entry] of Object.entries(entries)) {
    if (entry.IsAPIKey || now - entry.updatedAt <= STALE_THRESHOLD_S) continue;
    const binary = TYPE_TO_BINARY[entry.Type];
    if (!binary) continue;
    const references = onlineRunners.filter(
      (runner) => runner.agents.some(
        (agent) => makeKey(agent.Type, agent.Account, agent.Plan) === key,
      ),
    );
    if (references.length === 0) continue;

    const runner = references[Math.floor(Math.random() * references.length)];
    runnerManager.sendFire(runner.id, "info.fetch", { agent: binary });
    console.log(`[quota-aggregator] stale ${entry.Type} (key: ${key}) — requested info.fetch from runner ${runner.id}`);
  }
}

let lastAggregateAt = 0;
const MIN_ACCESS_INTERVAL_MS = 5 * 60 * 1000;

export async function aggregateQuota(): Promise<void> {
  lastAggregateAt = Date.now();
  queueInitialFetches();
  await requestStaleRefreshes();
}

export function notifyQuotaAggregatorAccess(): void {
  if (Date.now() - lastAggregateAt <= MIN_ACCESS_INTERVAL_MS) return;
  aggregateQuota().catch((err) => console.error("[quota-aggregator] access-triggered run failed:", err));
}

export function startQuotaAggregator(): void {
  aggregateQuota().catch((err) => console.error("[quota-aggregator] initial run failed:", err));
  setInterval(() => {
    aggregateQuota().catch((err) => console.error("[quota-aggregator] periodic run failed:", err));
  }, 6 * 60 * 60 * 1000);
}
