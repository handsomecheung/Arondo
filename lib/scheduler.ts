import { eventBus } from "./event-bus";
import {
  getSessions,
  getSession,
  getPendingTodoMessages,
  resolveTodoMessage,
  type Message,
  type Session,
  type TodoStatus,
} from "./store";
import { dispatchFollowupMessage } from "./session-actions";
import { isQuotaAvailable } from "./autoselect";
import { getProjectReadiness } from "./project-readiness";

const TICK_MS = 30_000;

// Guards against the event-bus fast-path and the periodic tick racing to
// dispatch the same todo message twice (single-process, but both paths are async).
const dispatching = new Set<string>();

async function resolveAndBroadcast(
  sessionId: string,
  messageId: string,
  patch: { todoStatus: TodoStatus; todoResultMessageId?: string; todoError?: string },
): Promise<void> {
  const updated = await resolveTodoMessage(sessionId, messageId, patch);
  if (updated) eventBus.publish({ type: "message_updated", payload: updated });
  const session = await getSession(sessionId);
  if (session) eventBus.publish({ type: "session_updated", payload: session });
}

export async function executeAction(session: Session, todo: Message): Promise<void> {
  if (dispatching.has(todo.id)) return;
  dispatching.add(todo.id);
  try {
    // Re-read: another path may have already claimed/cancelled this todo.
    const fresh = (await getPendingTodoMessages(session.id)).find((m) => m.id === todo.id);
    if (!fresh) return;
    await resolveAndBroadcast(session.id, todo.id, { todoStatus: "triggered" });

    const result = await dispatchFollowupMessage(session.id, todo.content, {
      prompt: todo.prompt,
      tokenUuid: todo.tokenUuid,
    });

    if (result.ok) {
      await resolveAndBroadcast(session.id, todo.id, { todoStatus: "done", todoResultMessageId: (result as any).message?.id });
    } else if (result.status === 400 || result.status === 503) {
      // Transient (e.g. agent already running, runner briefly offline) — retry next tick.
      await resolveAndBroadcast(session.id, todo.id, { todoStatus: "pending", todoError: result.error });
    } else {
      await resolveAndBroadcast(session.id, todo.id, { todoStatus: "failed", todoError: result.error });
    }
  } catch (err: any) {
    console.error(`[scheduler] todo ${todo.id} failed:`, err);
    await resolveAndBroadcast(session.id, todo.id, { todoStatus: "failed", todoError: err?.message || String(err) });
  } finally {
    dispatching.delete(todo.id);
  }
}

// A draft's target codebase is "ready" once no agent is actively running
// against it and the working tree has no uncommitted changes.
async function isCodebaseReady(runnerId: string, repoPath: string): Promise<boolean> {
  const { dirty, busy } = await getProjectReadiness(runnerId, repoPath);
  return !dirty && !busy;
}

async function evaluateTodo(session: Session, todo: Message): Promise<void> {
  const trigger = todo.todoTrigger;
  if (!trigger) return;
  if (trigger.kind === "at") {
    if (trigger.timestamp && trigger.timestamp <= Date.now()) await executeAction(session, todo);
  } else if (trigger.kind === "afterSession") {
    if (session.status !== "running" && session.status !== "script-running") await executeAction(session, todo);
  } else if (trigger.kind === "quotaAvailable") {
    if (await isQuotaAvailable(trigger.agentType as any)) await executeAction(session, todo);
  } else if (trigger.kind === "codebaseReady") {
    if (await isCodebaseReady(session.runnerId, session.repoPath)) await executeAction(session, todo);
  }
  // "manual" never auto-fires.
}

async function tick(): Promise<void> {
  let sessions: Session[];
  try {
    sessions = await getSessions();
  } catch (err) {
    console.error("[scheduler] failed to read sessions:", err);
    return;
  }

  // Oldest first, so todos targeting the same codebase dispatch in FIFO
  // order instead of racing within the same tick.
  const candidates = sessions
    .filter((s) => s.pendingTodoMessageIds && s.pendingTodoMessageIds.length > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const session of candidates) {
    try {
      const todos = await getPendingTodoMessages(session.id);
      for (const todo of todos) {
        await evaluateTodo(session, todo);
      }
    } catch (err) {
      console.error(`[scheduler] error evaluating session ${session.id}:`, err);
    }
  }
}

// Fast-path: react immediately when a session's agent stops running, instead
// of waiting up to TICK_MS for an "afterSession" follow-up or another
// session's "codebaseReady" todo to fire.
function onSessionUpdated(session: Session): void {
  if (session.status === "running" || session.status === "script-running") return;

  getPendingTodoMessages(session.id)
    .then(async (todos) => {
      const followup = todos.find((t) => t.todoTrigger?.kind === "afterSession");
      if (followup) {
        await executeAction(session, followup).catch((err) =>
          console.error("[scheduler] fast-path dispatch failed:", err),
        );
      }
    })
    .catch((err) => console.error("[scheduler] fast-path afterSession lookup failed:", err));

  if (!session.runnerId || !session.repoPath) return;

  getSessions()
    .then(async (sessions) => {
      const targets = sessions
        .filter(
          (s) =>
            s.id !== session.id &&
            s.runnerId === session.runnerId &&
            s.repoPath === session.repoPath &&
            s.pendingTodoMessageIds &&
            s.pendingTodoMessageIds.length > 0,
        )
        // Oldest pending todo first, so todos targeting the same codebase
        // dispatch in FIFO order instead of newest-first.
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      for (const target of targets) {
        const todos = await getPendingTodoMessages(target.id);
        const draft = todos.find((t) => t.todoTrigger?.kind === "codebaseReady");
        if (draft && (await isCodebaseReady(target.runnerId, target.repoPath))) {
          await executeAction(target, draft).catch((err) =>
            console.error("[scheduler] fast-path dispatch failed:", err),
          );
        }
      }
    })
    .catch((err) => console.error("[scheduler] fast-path codebaseReady lookup failed:", err));
}

export function startScheduler(): void {
  const p = process as typeof process & { __arondoSchedulerStarted?: boolean };
  if (p.__arondoSchedulerStarted) return;
  p.__arondoSchedulerStarted = true;

  eventBus.subscribe((event) => {
    if (event.type === "session_updated" && event.payload?.id) {
      onSessionUpdated(event.payload as Session);
    }
  });
  setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick failed:", err));
  }, TICK_MS);
  tick().catch((err) => console.error("[scheduler] initial tick failed:", err));
  console.log("[scheduler] started");
}
