import { NextRequest, NextResponse } from "next/server";
import {
  getScheduledTasks,
  addScheduledTask,
  type ScheduledTask,
  type ScheduledTaskTrigger,
  type ScheduledTaskAction,
} from "@/lib/store";
import {
  getArondoToken,
  getUuidByToken,
  verifySessionPermission,
  verifyProjectPermission,
} from "@/lib/auth";

function scopeOf(task: Pick<ScheduledTask, "trigger" | "action">): { sessionId?: string; projectId?: string } {
  if (task.trigger.kind === "afterSession") return { sessionId: task.trigger.sessionId };
  if (task.action.kind === "sendMessage") return { sessionId: task.action.sessionId };
  return { sessionId: task.action.sessionId, projectId: task.action.projectId };
}

async function hasScopePermission(
  scope: { sessionId?: string; projectId?: string },
  token: string | null,
): Promise<boolean> {
  if (scope.sessionId) return verifySessionPermission(scope.sessionId, token);
  if (scope.projectId) return verifyProjectPermission(scope.projectId, token);
  return false;
}

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  const tasks = await getScheduledTasks();

  const filtered: ScheduledTask[] = [];
  for (const task of tasks) {
    if (await hasScopePermission(scopeOf(task), token)) {
      filtered.push(task);
    }
  }
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  const body = await request.json();
  const trigger = body.trigger as ScheduledTaskTrigger;
  const action = body.action as ScheduledTaskAction;
  const label: string | undefined = body.label;

  if (!trigger || !action) {
    return NextResponse.json({ error: "trigger and action are required" }, { status: 400 });
  }
  if (!["at", "afterSession", "quotaAvailable"].includes(trigger.kind)) {
    return NextResponse.json({ error: "Invalid trigger.kind" }, { status: 400 });
  }
  if (!["runScript", "sendMessage"].includes(action.kind)) {
    return NextResponse.json({ error: "Invalid action.kind" }, { status: 400 });
  }
  if (trigger.kind === "at" && (!trigger.timestamp || trigger.timestamp <= Date.now())) {
    return NextResponse.json({ error: "trigger.timestamp must be in the future" }, { status: 400 });
  }
  if (action.kind === "sendMessage" && !action.message?.trim()) {
    return NextResponse.json({ error: "action.message is required" }, { status: 400 });
  }
  if (action.kind === "runScript" && !action.scriptName) {
    return NextResponse.json({ error: "action.scriptName is required" }, { status: 400 });
  }
  if (action.kind === "runScript" && !action.sessionId && !action.projectId) {
    return NextResponse.json({ error: "action requires sessionId or projectId" }, { status: 400 });
  }

  const scope = scopeOf({ trigger, action });
  if (!(await hasScopePermission(scope, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await addScheduledTask({
    trigger,
    action,
    label,
    tokenUuid: getUuidByToken(token) || undefined,
  });
  return NextResponse.json(task);
}

export const dynamic = "force-dynamic";
