import { processQuotaErrorRetries } from "./heartbeat";
import { aggregateQuota } from "./quota-aggregator";
import { runnerManager } from "./runner-manager";
import {
  processPendingTodoMessages,
  recoverInterruptedTodoDispatches,
} from "./scheduler";

const MAINTENANCE_INTERVAL_MS = 60 * 1000;
const TASK_PURGE_INTERVAL_MS = 60 * 60 * 1000;
const QUOTA_AGGREGATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

let isRunning = false;
let lastTaskPurgeAt = 0;
let lastQuotaAggregationAt = 0;

async function runMaintenance(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const now = Date.now();
    if (now - lastQuotaAggregationAt >= QUOTA_AGGREGATION_INTERVAL_MS) {
      try {
        await aggregateQuota();
        lastQuotaAggregationAt = now;
      } catch (err) {
        console.error("[maintenance] quota aggregation failed:", err);
      }
    }
    if (now - lastTaskPurgeAt >= TASK_PURGE_INTERVAL_MS) {
      try {
        runnerManager.purgeExpiredTasks();
        lastTaskPurgeAt = now;
      } catch (err) {
        console.error("[maintenance] task purge failed:", err);
      }
    }
    try {
      await processQuotaErrorRetries();
    } catch (err) {
      console.error("[maintenance] quota retry processing failed:", err);
    }
    try {
      await processPendingTodoMessages();
    } catch (err) {
      console.error("[maintenance] todo processing failed:", err);
    }
  } finally {
    isRunning = false;
  }
}

export function startMaintenance(): void {
  const p = process as typeof process & { __arondoMaintenanceStarted?: boolean };
  if (p.__arondoMaintenanceStarted) return;
  p.__arondoMaintenanceStarted = true;

  recoverInterruptedTodoDispatches()
    .catch((err) => console.error("[maintenance] startup recovery failed:", err))
    .finally(() => {
      runMaintenance().catch((err) => console.error("[maintenance] initial tick failed:", err));
      setInterval(() => {
        runMaintenance().catch((err) => console.error("[maintenance] periodic tick failed:", err));
      }, MAINTENANCE_INTERVAL_MS);
    });
  console.log("[maintenance] started");
}
