import { eventBus } from "./event-bus";
import {
  getScheduledTasks,
  getScheduledTask,
  updateScheduledTask,
  getSession,
  type ScheduledTask,
} from "./store";
import { dispatchFollowupMessage, dispatchSessionScript } from "./session-actions";
import { dispatchProjectScript } from "./project-actions";
import { isQuotaAvailable } from "./autoselect";

const TICK_MS = 30_000;

// Guards against the event-bus fast-path and the periodic tick racing to
// dispatch the same task twice (single-process, but both paths are async).
const dispatching = new Set<string>();

async function executeAction(task: ScheduledTask): Promise<void> {
  if (dispatching.has(task.id)) return;
  dispatching.add(task.id);
  try {
    // Re-read: another path may have already claimed/cancelled this task.
    const fresh = await getScheduledTask(task.id);
    if (!fresh || fresh.status !== "pending") return;
    await updateScheduledTask(task.id, { status: "triggered" });

    let result: { ok: true; [k: string]: any } | { ok: false; error: string; status: number };
    if (task.action.kind === "sendMessage") {
      result = await dispatchFollowupMessage(task.action.sessionId, task.action.message, {
        prompt: task.action.prompt,
        tokenUuid: task.tokenUuid,
      });
    } else if (task.action.sessionId) {
      result = await dispatchSessionScript(task.action.sessionId, task.action.scriptName, {
        tokenUuid: task.tokenUuid,
      });
    } else if (task.action.projectId) {
      result = await dispatchProjectScript(task.action.projectId, task.action.scriptName, {
        tokenUuid: task.tokenUuid,
      });
    } else {
      result = { ok: false, error: "Scheduled task action is missing a target session/project", status: 400 };
    }

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

async function tick(): Promise<void> {
  let tasks: ScheduledTask[];
  try {
    tasks = await getScheduledTasks();
  } catch (err) {
    console.error("[scheduler] failed to read scheduled tasks:", err);
    return;
  }

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
      }
    } catch (err) {
      console.error(`[scheduler] error evaluating task ${task.id}:`, err);
    }
  }
}

// Fast-path: react immediately when a session's agent stops running, instead
// of waiting up to TICK_MS for an "afterSession" follow-up to fire.
function onSessionUpdated(session: { id: string; status: string }): void {
  if (session.status === "running") return;
  getScheduledTasks()
    .then((tasks) => {
      const match = tasks.find(
        (t) => t.status === "pending" && t.trigger.kind === "afterSession" && t.trigger.sessionId === session.id,
      );
      if (match) executeAction(match).catch((err) => console.error("[scheduler] fast-path dispatch failed:", err));
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
