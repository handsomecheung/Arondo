import { NextRequest, NextResponse } from "next/server";
import {
  getScheduledTasks,
  addScheduledTask,
  type ScheduledTask,
  type ScheduledTaskTrigger,
  type ScheduledTaskAction,
} from "@/lib/store";
import { getArondoToken, getUuidByToken } from "@/lib/auth";
import { scopeOf, hasScopePermission } from "@/lib/scheduled-task-scope";

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
  if (!["at", "afterSession", "quotaAvailable", "codebaseReady"].includes(trigger.kind)) {
    return NextResponse.json({ error: "Invalid trigger.kind" }, { status: 400 });
  }
  if (action.kind !== "sendMessage") {
    return NextResponse.json({ error: "Invalid action.kind" }, { status: 400 });
  }
  if (trigger.kind === "at" && (!trigger.timestamp || trigger.timestamp <= Date.now())) {
    return NextResponse.json({ error: "trigger.timestamp must be in the future" }, { status: 400 });
  }
  if (trigger.kind === "codebaseReady" && (!trigger.runnerId || !trigger.repoPath)) {
    return NextResponse.json({ error: "trigger.runnerId and trigger.repoPath are required" }, { status: 400 });
  }
  if (!action.message?.trim()) {
    return NextResponse.json({ error: "action.message is required" }, { status: 400 });
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
