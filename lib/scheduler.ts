import { eventBus } from "./event-bus";
import {
  getScheduledTasks,
  getScheduledTask,
  updateScheduledTask,
  getSession,
  getSessions,
  type ScheduledTask,
} from "./store";
import { dispatchFollowupMessage } from "./session-actions";
import { isQuotaAvailable } from "./autoselect";
import { runnerManager } from "./runner-manager";

const TICK_MS = 30_000;

// Guards against the event-bus fast-path and the periodic tick racing to
// dispatch the same task twice (single-process, but both paths are async).
const dispatching = new Set<string>();

export async function executeAction(task: ScheduledTask): Promise<void> {
  if (dispatching.has(task.id)) return;
  dispatching.add(task.id);
  try {
    // Re-read: another path may have already claimed/cancelled this task.
    const fresh = await getScheduledTask(task.id);
    if (!fresh || fresh.status !== "pending") return;
    await updateScheduledTask(task.id, { status: "triggered" });

    const result = await dispatchFollowupMessage(task.action.sessionId, task.action.message, {
      prompt: task.action.prompt,
      tokenUuid: task.tokenUuid,
    });

    if (result.ok) {
      await updateScheduledTask(task.id, { status: "done", resultMessageId: (result as any).messageId });
    } else if (result.status === 400 || result.status === 503) {
      // Transient (e.g. agent already running, runner briefly offline) — retry next tick.
      await updateScheduledTask(task.id, { status: "pending", lastError: result.error });
    } else {
      await updateScheduledTask(task.id, { status: "failed", lastError: result.error });
    }
  } catch (err: any) {
    console.error(`[scheduler] task ${task.id} failed:`, err);
    await updateScheduledTask(task.id, { status: "failed", lastError: err?.message || String(err) });
  } finally {
    dispatching.delete(task.id);
  }
}

// A draft's target codebase is "ready" once no session is actively running
// against it and the working tree has no uncommitted changes.
async function isCodebaseReady(runnerId: string, repoPath: string): Promise<boolean> {
  const sessions = await getSessions();
  const isBusy = sessions.some(
    (s) => s.runnerId === runnerId && s.repoPath === repoPath && (s.status === "running" || s.status === "script-running"),
  );
  if (isBusy) return false;

  const connectedRunnerId = runnerManager.resolveRunnerId(runnerId);
  if (!connectedRunnerId) return false;

  const result = await runnerManager.sendRequest(connectedRunnerId, "git.status", { workDir: repoPath });
  return !result.hasChanges;
}

async function tick(): Promise<void> {
  let tasks: ScheduledTask[];
  try {
    tasks = await getScheduledTasks();
  } catch (err) {
    console.error("[scheduler] failed to read scheduled tasks:", err);
    return;
  }

  // Oldest first, so drafts targeting the same codebase dispatch in FIFO
  // order instead of racing within the same tick.
  tasks = [...tasks].sort((a, b) => a.createdAt - b.createdAt);

  const now = Date.now();
  for (const task of tasks) {
    if (task.status !== "pending") continue;
    try {
      if (task.trigger.kind === "at") {
        if (task.trigger.timestamp <= now) await executeAction(task);
      } else if (task.trigger.kind === "afterSession") {
        const session = await getSession(task.trigger.sessionId);
        if (!session) {
          await updateScheduledTask(task.id, { status: "expired", lastError: "Session no longer exists" });
        } else if (session.status !== "running") {
          await executeAction(task);
        }
      } else if (task.trigger.kind === "quotaAvailable") {
        if (await isQuotaAvailable(task.trigger.agentType as any)) await executeAction(task);
      } else if (task.trigger.kind === "codebaseReady") {
        if (await isCodebaseReady(task.trigger.runnerId, task.trigger.repoPath)) await executeAction(task);
      }
    } catch (err) {
      console.error(`[scheduler] error evaluating task ${task.id}:`, err);
    }
  }
}

// Fast-path: react immediately when a session's agent stops running, instead
// of waiting up to TICK_MS for an "afterSession" follow-up or a draft's
// "codebaseReady" trigger to fire.
function onSessionUpdated(session: { id: string; status: string; runnerId?: string; repoPath?: string }): void {
  if (session.status === "running" || session.status === "script-running") return;
  getScheduledTasks()
    .then(async (tasks) => {
      const followup = tasks.find(
        (t) => t.status === "pending" && t.trigger.kind === "afterSession" && t.trigger.sessionId === session.id,
      );
      if (followup) {
        await executeAction(followup).catch((err) => console.error("[scheduler] fast-path dispatch failed:", err));
      }

      if (session.runnerId && session.repoPath) {
        const drafts = tasks.filter(
          (t) =>
            t.status === "pending" &&
            t.trigger.kind === "codebaseReady" &&
            t.trigger.runnerId === session.runnerId &&
            t.trigger.repoPath === session.repoPath,
        );
        for (const draft of drafts) {
          if (await isCodebaseReady(session.runnerId!, session.repoPath!)) {
            await executeAction(draft).catch((err) => console.error("[scheduler] fast-path dispatch failed:", err));
          }
        }
      }
    })
    .catch((err) => console.error("[scheduler] fast-path lookup failed:", err));
}

export function startScheduler(): void {
  const p = process as typeof process & { __arondoSchedulerStarted?: boolean };
  if (p.__arondoSchedulerStarted) return;
  p.__arondoSchedulerStarted = true;

  eventBus.subscribe((event) => {
    if (event.type === "session_updated" && event.payload?.id) {
      onSessionUpdated(event.payload);
    }
  });
  setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick failed:", err));
  }, TICK_MS);
  tick().catch((err) => console.error("[scheduler] initial tick failed:", err));
  console.log("[scheduler] started");
}
