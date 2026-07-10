import type { ScheduledTask } from "./store";
import { verifySessionPermission } from "./auth";

export function scopeOf(task: Pick<ScheduledTask, "trigger" | "action">): { sessionId: string } {
  return { sessionId: task.action.sessionId };
}

export async function hasScopePermission(
  scope: { sessionId: string },
  token: string | null,
): Promise<boolean> {
  return verifySessionPermission(scope.sessionId, token);
}
