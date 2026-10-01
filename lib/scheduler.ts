import { eventBus } from "./event-bus";
import {
  getSessions,
  getSession,
  getMessages,
  getPendingTodoMessages,
  resolveTodoMessage,
  type Message,
  type Session,
  type TodoStatus,
} from "./store";
import { dispatchFollowupMessage } from "./session-actions";
import { isQuotaAvailable } from "./autoagent";
import { getProjectReadiness } from "./project-readiness";

// Guards against concurrent attempts to dispatch the same todo message.
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
async function isCodebaseReady(session: Pick<Session, "runnerId" | "repoPath" | "noProject">): Promise<boolean> {
  if (session.noProject) return true;
  const { dirty, busy } = await getProjectReadiness(session.runnerId, session.repoPath);
  return !dirty && !busy;
}

export function canDispatchAfterSessionTodo(session: Pick<Session, "status" | "errorMessage">): boolean {
  return session.status === "done" || (session.status === "script-running" && !session.errorMessage);
}

async function evaluateTodo(session: Session, todo: Message): Promise<void> {
  const trigger = todo.todoTrigger;
  if (!trigger) return;
  if (trigger.kind === "at") {
    if (trigger.timestamp && trigger.timestamp <= Date.now()) await executeAction(session, todo);
  } else if (trigger.kind === "afterSession") {
    // Only fire once the current run finished successfully — an "error"
    // status leaves the todo pending so the user can decide manually.
    if (canDispatchAfterSessionTodo(session)) await executeAction(session, todo);
  } else if (trigger.kind === "quotaAvailable") {
    if (await isQuotaAvailable(trigger.agentType as any, trigger.agyQuotaGroup)) await executeAction(session, todo);
  } else if (trigger.kind === "codebaseReady") {
    if (await isCodebaseReady(session)) await executeAction(session, todo);
  }
  // "manual" never auto-fires.
}

export async function processPendingTodoMessages(): Promise<void> {
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

// "triggered" only exists transiently while executeAction is running within
// this process — nothing else advances it. If the process dies (crash,
// restart) between marking a todo "triggered" and it resolving to
// done/pending/failed, the entry is orphaned: excluded from
// getPendingTodoMessages() forever, so the scheduler would never look at it
// again and the UI would show "Sending…" indefinitely. Resolve any such
// leftovers to a terminal "failed" state on startup so the user gets a clear
// notification instead of a stuck spinner, and can resend manually.
export async function recoverInterruptedTodoDispatches(): Promise<void> {
  let sessions: Session[];
  try {
    sessions = await getSessions();
  } catch (err) {
    console.error("[scheduler] failed to read sessions during startup recovery:", err);
    return;
  }
  for (const session of sessions) {
    try {
      const messages = await getMessages(session.id);
      const stuck = messages.filter((m) => m.type === "user-todo" && m.todoStatus === "triggered");
      for (const todo of stuck) {
        await resolveAndBroadcast(session.id, todo.id, {
          todoStatus: "failed",
          todoError: "Interrupted before completion (server restarted) — please resend.",
        });
      }
    } catch (err) {
      console.error(`[scheduler] startup recovery failed for session ${session.id}:`, err);
    }
  }
}
