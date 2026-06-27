import type { WebSocket } from "ws";
import { eventBus } from "./event-bus";
import {
  appendSessionLog,
  clearSessionLog,
  updateSession,
  addMessage,
  getSession,
  getSessionLog,
} from "./store";
import {
  getAgySessionId,
  detectAgyConvId,
  saveAgySessionId,
} from "./agents/antigravity";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "active-tasks.json");
const RUNNERS_DIR = path.join(DATA_DIR, "runners");
const TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunnerInfo {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  os: string;
  arch: string;
  version: string;
  capabilities: string[];
  agents: string[];
  connected: boolean;
  lastSeenAt?: number;
}

interface RunnerConnection {
  id: string;
  ws: WebSocket;
  info: RunnerInfo;
}

export interface TaskContext {
  taskId: string;
  runnerId: string;
  sessionId: string;
  messageId: string;
  type: "agent" | "script";
  scriptName?: string;
  pid?: number;
  createdAt: number;
  completedAt?: number;
  exitCode?: number;
  stoppedByUser?: boolean;
}

interface PendingRequest {
  runnerId: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface MessageEnvelope {
  id: string;
  type: "request" | "response" | "stream" | "event";
  method?: string;
  payload: any;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

class RunnerManager {
  private runners = new Map<string, RunnerConnection>();
  private knownIds = new Map<string, string>();
  private tasks = new Map<string, TaskContext>();
  private ptyKeyToTaskId = new Map<string, string>();
  private pending = new Map<string, PendingRequest>();
  private idCounter = 0;

  private nextId(): string {
    return `srv_${++this.idCounter}_${Date.now().toString(36)}`;
  }

  // ─── Runner persistence ─────────────────────────────────────────────

  private runnerFilePath(id: string): string {
    return path.join(RUNNERS_DIR, id, "runner.json");
  }

  private async persistRunner(info: RunnerInfo): Promise<void> {
    const filePath = this.runnerFilePath(info.id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(info, null, 2), "utf-8");
  }

  async restoreRunners(): Promise<void> {
    try {
      await fs.mkdir(RUNNERS_DIR, { recursive: true });
      const entries = await fs.readdir(RUNNERS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const filePath = path.join(RUNNERS_DIR, entry.name, "runner.json");
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const info: RunnerInfo = JSON.parse(raw);
          const stableKey = `${info.name}@${info.hostname}`;
          this.knownIds.set(stableKey, info.id);
        } catch {
          // Ignore corrupt runner files
        }
      }
      if (this.knownIds.size > 0) {
        console.log(
          `[runner-manager] restored ${this.knownIds.size} known runner(s) from disk`,
        );
      }
    } catch {
      // Directory doesn't exist yet — fine on first run
    }
  }

  // ─── Task persistence ──────────────────────────────────────────────────

  private async persistTasks(): Promise<void> {
    const data = Array.from(this.tasks.values());
    await fs.mkdir(path.dirname(TASKS_FILE), { recursive: true });
    await fs.writeFile(TASKS_FILE, JSON.stringify(data), "utf-8");
  }

  async restoreTasks(): Promise<void> {
    try {
      const raw = await fs.readFile(TASKS_FILE, "utf-8");
      const data: TaskContext[] = JSON.parse(raw);
      for (const ctx of data) {
        this.tasks.set(ctx.taskId, ctx);
        if (!ctx.completedAt) {
          const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
          this.ptyKeyToTaskId.set(ptyKey, ctx.taskId);
        }
      }
      if (data.length > 0) {
        console.log(
          `[runner-manager] restored ${data.length} task(s) from disk`,
        );
      }
      this.purgeExpiredTasks();
    } catch {
      // File doesn't exist or is invalid — that's fine on first run
    }
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────

  addRunner(ws: WebSocket, registerPayload: any, ip?: string): string {
    const name: string = registerPayload.name || "unknown";
    const hostname: string = registerPayload.hostname || "";

    const stableKey = `${name}@${hostname}`;
    let id = this.knownIds.get(stableKey);

    if (id) {
      const existing = this.runners.get(id);
      if (existing) {
        if (existing.ws.readyState === 1 /* OPEN */ || existing.ws.readyState === 0 /* CONNECTING */) {
          existing.ws.close();
        }
      }
    } else {
      id = crypto.randomUUID();
      this.knownIds.set(stableKey, id);
    }

    const info: RunnerInfo = {
      id,
      name,
      hostname,
      ip: ip || "",
      os: registerPayload.os || "",
      arch: registerPayload.arch || "",
      version: registerPayload.version || "",
      capabilities: registerPayload.capabilities || [],
      agents: registerPayload.agents || [],
      connected: true,
      lastSeenAt: Date.now(),
    };
    this.runners.set(id, { id, ws, info });
    this.persistRunner(info).catch(() => {});
    console.log(`[runner-manager] runner registered: ${info.name} (${id})`);

    // Re-associate persisted tasks that originally belonged to this runner
    for (const [taskId, ctx] of this.tasks) {
      if (ctx.runnerId === id) {
        console.log(
          `[runner-manager] runner ${id} reconnected, task ${taskId} retained`,
        );
      }
    }

    return id;
  }

  removeRunner(runnerId: string): void {
    const ctrl = this.runners.get(runnerId);
    if (ctrl) {
      ctrl.info.connected = false;
      ctrl.info.lastSeenAt = Date.now();
      this.persistRunner(ctrl.info).catch(() => {});
      this.runners.delete(runnerId);
      console.log(
        `[runner-manager] runner disconnected: ${ctrl.info.name} (${runnerId})`,
      );

      for (const [reqId, pending] of this.pending) {
        if (pending.runnerId !== runnerId) continue;
        pending.reject(new Error("Runner disconnected"));
        clearTimeout(pending.timer);
        this.pending.delete(reqId);
      }

      // Collect active tasks to fail before iterating (async cleanup modifies the map)
      const orphanedTaskIds: string[] = [];
      for (const [taskId, ctx] of this.tasks) {
        if (ctx.runnerId === runnerId && !ctx.completedAt) {
          orphanedTaskIds.push(taskId);
        }
      }
      for (const taskId of orphanedTaskIds) {
        console.log(`[runner-manager] failing orphaned task: ${taskId}`);
        this.onExecExit({ taskId, exitCode: -1 }).catch((err) => {
          console.error("[runner-manager] failed to clean up task:", err);
        });
      }
    }
  }

  getRunners(): RunnerInfo[] {
    return Array.from(this.runners.values()).map((c) => ({ ...c.info }));
  }

  async getAllKnownRunners(): Promise<RunnerInfo[]> {
    const allRunners = new Map<string, RunnerInfo>();

    for (const conn of this.runners.values()) {
      allRunners.set(conn.id, { ...conn.info });
    }

    try {
      const entries = await fs.readdir(RUNNERS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (allRunners.has(entry.name)) continue;
        const filePath = path.join(RUNNERS_DIR, entry.name, "runner.json");
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const info: RunnerInfo = JSON.parse(raw);
          info.connected = false;
          allRunners.set(info.id, info);
        } catch {
          // Ignore corrupt runner files
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return Array.from(allRunners.values());
  }

  getRunner(id: string): RunnerConnection | undefined {
    return this.runners.get(id);
  }

  resolveRunnerId(storedId: string): string | undefined {
    if (this.runners.has(storedId)) return storedId;
    return undefined;
  }

  // ─── Request / Response ───────────────────────────────────────────────

  async sendRequest(
    runnerId: string,
    method: string,
    payload: any,
    timeoutMs = 30_000,
  ): Promise<any> {
    const ctrl = this.runners.get(runnerId);
    if (!ctrl) {
      throw new Error(`Runner ${runnerId} not found or disconnected`);
    }

    const id = this.nextId();
    const msg: MessageEnvelope = { id, type: "request", method, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { runnerId, resolve, reject, timer });
      ctrl.ws.send(JSON.stringify(msg));
    });
  }

  sendFire(runnerId: string, method: string, payload: any): void {
    const ctrl = this.runners.get(runnerId);
    if (!ctrl) {
      console.warn(
        `[runner-manager] sendFire ${method}: runner ${runnerId} not found`,
      );
      return;
    }

    const id = this.nextId();
    const msg: MessageEnvelope = { id, type: "request", method, payload };
    ctrl.ws.send(JSON.stringify(msg));
  }

  // ─── Task management ─────────────────────────────────────────────────

  registerTask(ctx: TaskContext): void {
    this.tasks.set(ctx.taskId, ctx);
    const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
    this.ptyKeyToTaskId.set(ptyKey, ctx.taskId);
    console.log(
      `[runner-manager] task registered: ${ctx.taskId} (type=${ctx.type}, total=${this.tasks.size})`,
    );
    this.persistTasks().catch(() => {});
  }

  getTaskContext(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskContext[] {
    return Array.from(this.tasks.values());
  }

  getTaskIdByPtyKey(sessionId: string, messageId: string): string | undefined {
    return this.ptyKeyToTaskId.get(`${sessionId}:${messageId}`);
  }

  getRunnerForTask(taskId: string): string | undefined {
    return this.tasks.get(taskId)?.runnerId;
  }

  updateTaskPid(taskId: string, pid: number): void {
    const ctx = this.tasks.get(taskId);
    if (ctx) {
      ctx.pid = pid;
      console.log(`[runner-manager] task ${taskId} pid=${pid}`);
      this.persistTasks().catch(() => {});
    }
  }

  async killTask(sessionId: string, messageId: string): Promise<boolean> {
    const taskId = this.ptyKeyToTaskId.get(`${sessionId}:${messageId}`);
    if (!taskId) return false;

    const ctx = this.tasks.get(taskId);
    if (!ctx) return false;

    const runnerId = this.resolveRunnerId(ctx.runnerId);
    if (!runnerId) return false;

    try {
      ctx.stoppedByUser = true;

      const separator = "\r\n\x1b[90m─── stopped by user ───\x1b[0m\r\n";
      await appendSessionLog(ctx.sessionId, ctx.messageId, separator, true);
      eventBus.publish({
        type: "terminal_output",
        payload: {
          sessionId: ctx.sessionId,
          messageId: ctx.messageId,
          data: separator,
        },
      });

      await this.sendRequest(runnerId, "exec.cancel", {
        taskId,
        signal: "SIGTERM",
      });
      return true;
    } catch (err) {
      console.error(`[runner-manager] failed to kill task ${taskId}:`, err);
      return false;
    }
  }

  async restartTask(
    sessionId: string,
    messageId: string,
    command: string,
    workDir: string,
    cols = 120,
    rows = 30,
  ): Promise<boolean> {
    const taskId = this.ptyKeyToTaskId.get(`${sessionId}:${messageId}`);
    if (!taskId) return false;

    const ctx = this.tasks.get(taskId);
    if (!ctx) return false;

    const runnerId = this.resolveRunnerId(ctx.runnerId);
    if (!runnerId) return false;

    try {
      const res: any = await this.sendRequest(
        runnerId,
        "exec.restart",
        {
          taskId,
          command,
          workDir,
          cols,
          rows,
        },
        15_000,
      );
      if (res?.pid) this.updateTaskPid(taskId, res.pid);
      return true;
    } catch (err) {
      console.error(`[runner-manager] failed to restart task ${taskId}:`, err);
      return false;
    }
  }

  removeTasksForSession(sessionId: string): void {
    const toDelete: string[] = [];
    for (const [taskId, ctx] of this.tasks) {
      if (ctx.sessionId === sessionId) {
        const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
        this.ptyKeyToTaskId.delete(ptyKey);
        toDelete.push(taskId);
      }
    }
    for (const taskId of toDelete) {
      this.tasks.delete(taskId);
    }
    if (toDelete.length > 0) {
      console.log(
        `[runner-manager] removed ${toDelete.length} task(s) for deleted session ${sessionId}`,
      );
      this.persistTasks().catch(() => {});
    }
  }

  purgeExpiredTasks(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    for (const [taskId, ctx] of this.tasks) {
      if (ctx.completedAt && now - ctx.completedAt > TASK_RETENTION_MS) {
        const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
        this.ptyKeyToTaskId.delete(ptyKey);
        toDelete.push(taskId);
      }
    }
    for (const taskId of toDelete) {
      this.tasks.delete(taskId);
    }
    if (toDelete.length > 0) {
      console.log(`[runner-manager] purged ${toDelete.length} expired task(s)`);
      this.persistTasks().catch(() => {});
    }
  }

  // ─── Incoming message handler ─────────────────────────────────────────

  handleMessage(runnerId: string, raw: string): void {
    let msg: MessageEnvelope;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error(
        "[runner-manager] failed to parse message:",
        raw.slice(0, 200),
      );
      return;
    }

    switch (msg.type) {
      case "response":
        this.handleResponse(msg);
        break;
      case "stream":
        this.handleStream(msg);
        break;
      case "event":
        this.handleEvent(runnerId, msg);
        break;
      default:
        console.warn(`[runner-manager] unknown message type: ${msg.type}`);
    }
  }

  private handleResponse(msg: MessageEnvelope): void {
    const pending = this.pending.get(msg.id);
    if (!pending) {
      if (msg.payload?.ok === false) {
        console.warn(
          `[runner-manager] unmatched error response (fire-and-forget): ${msg.payload.error?.message || "unknown"}`,
        );
      }
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.payload?.ok === false) {
      pending.reject(
        new Error(msg.payload.error?.message || "Runner returned error"),
      );
    } else {
      pending.resolve(msg.payload);
    }
  }

  private handleStream(msg: MessageEnvelope): void {
    if (msg.method === "exec.output") {
      this.onExecOutput(msg.payload).catch((err) => {
        console.error("[runner-manager] onExecOutput error:", err);
      });
    } else {
      console.warn(`[runner-manager] unknown stream method: ${msg.method}`);
    }
  }

  private handleEvent(runnerId: string, msg: MessageEnvelope): void {
    switch (msg.method) {
      case "exec.exit":
        this.onExecExit(msg.payload).catch((err) => {
          console.error("[runner-manager] onExecExit error:", err);
        });
        break;
      case "pong":
        break;
      case "task.status":
        this.onTaskStatus(runnerId, msg.payload);
        break;
      case "agent.status":
        this.onAgentStatus(runnerId, msg.payload);
        break;
      default:
        break;
    }
  }

  // ─── Stream/Event handlers ────────────────────────────────────────────

  private onAgentStatus(runnerId: string, payload: { agents: string[] }): void {
    const conn = this.runners.get(runnerId);
    if (!conn || !Array.isArray(payload?.agents)) return;
    conn.info.agents = payload.agents;
    this.persistRunner(conn.info).catch(() => {});
    console.log(
      `[runner-manager] runner ${runnerId} agents updated: [${payload.agents.join(", ")}]`,
    );
  }

  private async onExecOutput(payload: {
    taskId: string;
    data: string;
    encoding?: string;
  }): Promise<void> {
    const ctx = this.tasks.get(payload.taskId);
    if (!ctx) {
      console.warn(
        `[runner-manager] exec.output for unknown task: ${payload.taskId}`,
      );
      return;
    }

    let data = payload.data;
    if (payload.encoding === "base64") {
      data = Buffer.from(payload.data, "base64").toString("utf-8");
    }

    await appendSessionLog(ctx.sessionId, ctx.messageId, data, true);
    eventBus.publish({
      type: "terminal_output",
      payload: {
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        data,
      },
    });
  }

  private async onExecExit(payload: {
    taskId: string;
    exitCode: number;
  }): Promise<void> {
    const ctx = this.tasks.get(payload.taskId);
    if (!ctx) return;
    if (ctx.completedAt) return;

    const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
    this.ptyKeyToTaskId.delete(ptyKey);
    ctx.completedAt = Date.now();
    ctx.exitCode = payload.exitCode;
    this.persistTasks().catch(() => {});

    if (ctx.type === "agent") {
      await this.handleAgentExit(ctx, payload.exitCode);
    } else {
      await this.handleScriptExit(ctx, payload.exitCode);
    }
  }

  private async handleAgentExit(
    ctx: TaskContext,
    exitCode: number,
  ): Promise<void> {
    const success = exitCode === 0;

    const session = await getSession(ctx.sessionId);
    if (session?.agentType === "antigravity") {
      try {
        const existingAgyId = await getAgySessionId(ctx.sessionId);
        if (!existingAgyId) {
          const convId = await detectAgyConvId();
          if (convId) {
            await saveAgySessionId(ctx.sessionId, convId);
          }
        }
      } catch (err) {
        console.error(
          "[runner-manager] failed to detect agy conversation:",
          err,
        );
      }
    }

    // Detect quota exhaustion: agy exits 0 but produces no output; claude logs session limit hit
    let quotaExhausted = false;
    if (session?.agentType === "antigravity" && success) {
      const log = await getSessionLog(ctx.sessionId, ctx.messageId);
      if (!log.trim()) {
        quotaExhausted = true;
      }
    } else if (session?.agentType === "claude") {
      const log = await getSessionLog(ctx.sessionId, ctx.messageId);
      if (log.includes("You've hit your session limit")) {
        quotaExhausted = true;
      }
    }

    const hasRunningScripts = (session?.runningScripts?.length ?? 0) > 0;
    let nextStatus: string;
    if (hasRunningScripts) {
      nextStatus = "script-running";
    } else {
      nextStatus = success && !quotaExhausted ? "done" : "error";
    }

    const stoppedByUser = !!ctx.stoppedByUser;

    const updated = await updateSession(ctx.sessionId, {
      status: nextStatus as any,
      errorMessage: quotaExhausted
        ? session?.agentType === "claude"
          ? "Claude session limit hit"
          : "agy quota exhausted — no output was produced"
        : success
          ? undefined
          : stoppedByUser
            ? "Stopped by user"
            : `Agent exited with code ${exitCode}`,
    });

    const content = quotaExhausted
      ? "⚠️ Your quota may be exhausted — please check your usage and try again later."
      : success
        ? "✅ Done!"
        : stoppedByUser
          ? "🛑 Stopped by user"
          : `❌ Error: Agent exited with code ${exitCode}`;
    const agentMsg = await addMessage({
      sessionId: ctx.sessionId,
      role: success && !quotaExhausted ? "agent" : "system",
      content,
      type: "agent-return",
      parentId: ctx.messageId,
    });

    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }

  private async handleScriptExit(
    ctx: TaskContext,
    exitCode: number,
  ): Promise<void> {
    eventBus.publish({
      type: "terminal_exit",
      payload: {
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        code: exitCode,
      },
    });

    const session = await getSession(ctx.sessionId);
    const currentRunning = session?.runningScripts || [];
    const removeIndex = currentRunning.indexOf(ctx.scriptName!);
    const nextRunning =
      removeIndex >= 0
        ? [
            ...currentRunning.slice(0, removeIndex),
            ...currentRunning.slice(removeIndex + 1),
          ]
        : [...currentRunning];

    const hasAgentTask = Array.from(this.tasks.values()).some(
      (t) =>
        t.sessionId === ctx.sessionId && t.type === "agent" && !t.completedAt,
    );

    if (exitCode === 0) {
      let nextStatus: string;
      if (hasAgentTask) nextStatus = "running";
      else if (nextRunning.length > 0) nextStatus = "script-running";
      else nextStatus = "done";
      const updated = await updateSession(ctx.sessionId, {
        status: nextStatus as any,
        runningScripts: nextRunning,
      });
      const doneMsg = await addMessage({
        sessionId: ctx.sessionId,
        role: "system",
        content: "✅ Script completed successfully.",
        type: "script-return",
        parentId: ctx.messageId,
      });
      eventBus.publish({ type: "message_added", payload: doneMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    } else {
      const stoppedByUser = !!ctx.stoppedByUser;
      const errorMessage = stoppedByUser
        ? "Stopped by user"
        : `Script exited with code ${exitCode}`;
      let nextStatus: string;
      if (hasAgentTask) nextStatus = "running";
      else if (nextRunning.length > 0) nextStatus = "script-running";
      else nextStatus = stoppedByUser ? "done" : "error";
      const updated = await updateSession(ctx.sessionId, {
        status: nextStatus as any,
        runningScripts: nextRunning,
        errorMessage: stoppedByUser ? undefined : errorMessage,
      });
      const errMsg = await addMessage({
        sessionId: ctx.sessionId,
        role: "system",
        content: stoppedByUser
          ? "🛑 Stopped by user"
          : `❌ Error: ${errorMessage}`,
        type: "script-return",
        parentId: ctx.messageId,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    }
  }

  private onTaskStatus(
    runnerId: string,
    payload: {
      tasks: Array<{
        taskId: string;
        state: string;
        exitCode?: number;
      }>;
    },
  ): void {
    if (!payload.tasks) return;

    const reportedTaskIds = new Set(payload.tasks.map((t) => t.taskId));

    for (const t of payload.tasks) {
      if (t.state === "exited" && t.exitCode !== undefined) {
        this.onExecExit({ taskId: t.taskId, exitCode: t.exitCode }).catch(
          (err) => {
            console.error("[runner-manager] onExecExit error:", err);
          },
        );
      } else if (t.state === "running") {
        const ctx = this.tasks.get(t.taskId);
        if (ctx && ctx.runnerId !== runnerId) {
          console.log(
            `[runner-manager] task.status: re-associating ${t.taskId} → ${runnerId}`,
          );
          ctx.runnerId = runnerId;
          this.persistTasks().catch(() => {});
        }
      }
    }

    // Clean up stale tasks that belong to this runner but weren't reported
    // (runner restarted and lost track of them)
    // Skip already-completed tasks — they are retained for history
    for (const [taskId, ctx] of this.tasks) {
      if (
        ctx.runnerId === runnerId &&
        !ctx.completedAt &&
        !reportedTaskIds.has(taskId)
      ) {
        console.log(
          `[runner-manager] task ${taskId} not reported by runner ${runnerId}, cleaning up`,
        );
        this.onExecExit({ taskId, exitCode: -1 }).catch((err) => {
          console.error("[runner-manager] stale task cleanup error:", err);
        });
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const p = process as typeof process & { __arondoRunnerMgr?: RunnerManager };
if (p.__arondoRunnerMgr) {
  // Hot reload: update prototype so existing singleton gets new/changed methods
  Object.setPrototypeOf(p.__arondoRunnerMgr, RunnerManager.prototype);
} else {
  p.__arondoRunnerMgr = new RunnerManager();
  p.__arondoRunnerMgr.restoreRunners().catch((err) => {
    console.error("[runner-manager] failed to restore runners:", err);
  });
  p.__arondoRunnerMgr.restoreTasks().catch((err) => {
    console.error("[runner-manager] failed to restore tasks:", err);
  });
  setInterval(
    () => {
      p.__arondoRunnerMgr!.purgeExpiredTasks();
    },
    60 * 60 * 1000,
  );
}

export const runnerManager = p.__arondoRunnerMgr;
