import type { WebSocket } from "ws";
import { eventBus } from "./event-bus";
import {
  appendSessionLog,
  clearSessionLog,
  updateSession,
  addMessage,
  getSession,
} from "./store";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "active-tasks.json");
const CONTROLLERS_DIR = path.join(DATA_DIR, "controllers");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ControllerInfo {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  version: string;
  capabilities: string[];
  connected: boolean;
}

interface ControllerConnection {
  id: string;
  ws: WebSocket;
  info: ControllerInfo;
}

export interface TaskContext {
  taskId: string;
  controllerId: string;
  sessionId: string;
  messageId: string;
  type: "agent" | "script";
  scriptName?: string;
}

interface PendingRequest {
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

class ControllerManager {
  private controllers = new Map<string, ControllerConnection>();
  private knownIds = new Map<string, string>();
  private tasks = new Map<string, TaskContext>();
  private ptyKeyToTaskId = new Map<string, string>();
  private pending = new Map<string, PendingRequest>();
  private idCounter = 0;

  private nextId(): string {
    return `srv_${++this.idCounter}_${Date.now().toString(36)}`;
  }

  // ─── Controller persistence ─────────────────────────────────────────────

  private controllerFilePath(id: string): string {
    return path.join(CONTROLLERS_DIR, id, "controller.json");
  }

  private async persistController(info: ControllerInfo): Promise<void> {
    const filePath = this.controllerFilePath(info.id);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(info, null, 2), "utf-8");
    } catch (err) {
      console.error("[controller-manager] failed to persist controller:", err);
    }
  }

  async restoreControllers(): Promise<void> {
    try {
      await fs.mkdir(CONTROLLERS_DIR, { recursive: true });
      const entries = await fs.readdir(CONTROLLERS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const filePath = path.join(CONTROLLERS_DIR, entry.name, "controller.json");
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const info: ControllerInfo = JSON.parse(raw);
          const stableKey = `${info.name}@${info.hostname}`;
          this.knownIds.set(stableKey, info.id);
        } catch {
          // Ignore corrupt controller files
        }
      }
      if (this.knownIds.size > 0) {
        console.log(`[controller-manager] restored ${this.knownIds.size} known controller(s) from disk`);
      }
    } catch {
      // Directory doesn't exist yet — fine on first run
    }
  }

  // ─── Task persistence ──────────────────────────────────────────────────

  private async persistTasks(): Promise<void> {
    const data = Array.from(this.tasks.values());
    try {
      await fs.mkdir(path.dirname(TASKS_FILE), { recursive: true });
      await fs.writeFile(TASKS_FILE, JSON.stringify(data), "utf-8");
    } catch (err) {
      console.error("[controller-manager] failed to persist tasks:", err);
    }
  }

  async restoreTasks(): Promise<void> {
    try {
      const raw = await fs.readFile(TASKS_FILE, "utf-8");
      const data: TaskContext[] = JSON.parse(raw);
      for (const ctx of data) {
        this.tasks.set(ctx.taskId, ctx);
        const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
        this.ptyKeyToTaskId.set(ptyKey, ctx.taskId);
      }
      if (data.length > 0) {
        console.log(`[controller-manager] restored ${data.length} task(s) from disk`);
      }
    } catch {
      // File doesn't exist or is invalid — that's fine on first run
    }
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────

  addController(ws: WebSocket, registerPayload: any): string {
    const name: string = registerPayload.name || "unknown";
    const hostname: string = registerPayload.hostname || "";

    const stableKey = `${name}@${hostname}`;
    let id = this.knownIds.get(stableKey);

    if (id) {
      const existing = this.controllers.get(id);
      if (existing) {
        try { existing.ws.close(); } catch {}
      }
    } else {
      id = crypto.randomUUID();
      this.knownIds.set(stableKey, id);
    }

    const info: ControllerInfo = {
      id,
      name,
      hostname,
      os: registerPayload.os || "",
      arch: registerPayload.arch || "",
      version: registerPayload.version || "",
      capabilities: registerPayload.capabilities || [],
      connected: true,
    };
    this.controllers.set(id, { id, ws, info });
    this.persistController(info).catch(() => {});
    console.log(`[controller-manager] controller registered: ${info.name} (${id})`);

    // Re-associate persisted tasks whose controllerId matches no connected controller
    for (const [taskId, ctx] of this.tasks) {
      if (!this.controllers.has(ctx.controllerId)) {
        console.log(`[controller-manager] re-associating task ${taskId} from ${ctx.controllerId} → ${id}`);
        ctx.controllerId = id;
      }
    }
    this.persistTasks().catch(() => {});

    return id;
  }

  removeController(controllerId: string): void {
    const ctrl = this.controllers.get(controllerId);
    if (ctrl) {
      ctrl.info.connected = false;
      this.persistController(ctrl.info).catch(() => {});
      this.controllers.delete(controllerId);
      console.log(`[controller-manager] controller disconnected: ${ctrl.info.name} (${controllerId})`);

      for (const [reqId, pending] of this.pending) {
        pending.reject(new Error("Controller disconnected"));
        clearTimeout(pending.timer);
        this.pending.delete(reqId);
      }

      // Fail all active tasks on this controller
      for (const [taskId, ctx] of this.tasks) {
        if (ctx.controllerId === controllerId) {
          console.log(`[controller-manager] failing orphaned task: ${taskId}`);
          this.onExecExit({ taskId, exitCode: -1 }).catch((err) => {
            console.error("[controller-manager] failed to clean up task:", err);
          });
        }
      }
    }
  }

  getControllers(): ControllerInfo[] {
    return Array.from(this.controllers.values()).map((c) => ({ ...c.info }));
  }

  getController(id: string): ControllerConnection | undefined {
    return this.controllers.get(id);
  }

  resolveControllerId(storedId: string): string | undefined {
    if (this.controllers.has(storedId)) return storedId;
    // Stored ID is stale — fall back to any connected controller
    for (const [id] of this.controllers) return id;
    return undefined;
  }

  // ─── Request / Response ───────────────────────────────────────────────

  async sendRequest(
    controllerId: string,
    method: string,
    payload: any,
    timeoutMs = 30_000
  ): Promise<any> {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) {
      throw new Error(`Controller ${controllerId} not found or disconnected`);
    }

    const id = this.nextId();
    const msg: MessageEnvelope = { id, type: "request", method, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      ctrl.ws.send(JSON.stringify(msg));
    });
  }

  sendFire(controllerId: string, method: string, payload: any): void {
    const ctrl = this.controllers.get(controllerId);
    if (!ctrl) {
      console.warn(`[controller-manager] sendFire ${method}: controller ${controllerId} not found`);
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
    console.log(`[controller-manager] task registered: ${ctx.taskId} (type=${ctx.type}, total=${this.tasks.size})`);
    this.persistTasks().catch(() => {});
  }

  getTaskContext(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  getTaskIdByPtyKey(sessionId: string, messageId: string): string | undefined {
    return this.ptyKeyToTaskId.get(`${sessionId}:${messageId}`);
  }

  getControllerForTask(taskId: string): string | undefined {
    return this.tasks.get(taskId)?.controllerId;
  }

  // ─── Incoming message handler ─────────────────────────────────────────

  handleMessage(controllerId: string, raw: string): void {
    let msg: MessageEnvelope;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error("[controller-manager] failed to parse message:", raw.slice(0, 200));
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
        this.handleEvent(controllerId, msg);
        break;
      default:
        console.warn(`[controller-manager] unknown message type: ${msg.type}`);
    }
  }

  private handleResponse(msg: MessageEnvelope): void {
    const pending = this.pending.get(msg.id);
    if (!pending) {
      if (msg.payload?.ok === false) {
        console.warn(`[controller-manager] unmatched error response (fire-and-forget): ${msg.payload.error?.message || "unknown"}`);
      }
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.payload?.ok === false) {
      pending.reject(
        new Error(msg.payload.error?.message || "Controller returned error")
      );
    } else {
      pending.resolve(msg.payload);
    }
  }

  private handleStream(msg: MessageEnvelope): void {
    if (msg.method === "exec.output") {
      this.onExecOutput(msg.payload).catch((err) => {
        console.error("[controller-manager] onExecOutput error:", err);
      });
    } else {
      console.warn(`[controller-manager] unknown stream method: ${msg.method}`);
    }
  }

  private handleEvent(controllerId: string, msg: MessageEnvelope): void {
    switch (msg.method) {
      case "exec.exit":
        this.onExecExit(msg.payload).catch((err) => {
          console.error("[controller-manager] onExecExit error:", err);
        });
        break;
      case "pong":
        break;
      case "task.status":
        this.onTaskStatus(controllerId, msg.payload);
        break;
      default:
        break;
    }
  }

  // ─── Stream/Event handlers ────────────────────────────────────────────

  private async onExecOutput(payload: {
    taskId: string;
    data: string;
    encoding?: string;
  }): Promise<void> {
    const ctx = this.tasks.get(payload.taskId);
    if (!ctx) {
      console.warn(`[controller-manager] exec.output for unknown task: ${payload.taskId}`);
      return;
    }

    let data = payload.data;
    if (payload.encoding === "base64") {
      data = Buffer.from(payload.data, "base64").toString("utf-8");
    }

    if (ctx.type === "agent") {
      for (const line of data.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          await appendSessionLog(ctx.sessionId, ctx.messageId, line);
          eventBus.publish({
            type: "agent_output",
            payload: {
              sessionId: ctx.sessionId,
              messageId: ctx.messageId,
              line,
            },
          });
        }
      }
    } else {
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
  }

  private async onExecExit(payload: {
    taskId: string;
    exitCode: number;
  }): Promise<void> {
    const ctx = this.tasks.get(payload.taskId);
    if (!ctx) return;

    const ptyKey = `${ctx.sessionId}:${ctx.messageId}`;
    this.ptyKeyToTaskId.delete(ptyKey);
    this.tasks.delete(payload.taskId);
    this.persistTasks().catch(() => {});

    if (ctx.type === "agent") {
      await this.handleAgentExit(ctx, payload.exitCode);
    } else {
      await this.handleScriptExit(ctx, payload.exitCode);
    }
  }

  private async handleAgentExit(
    ctx: TaskContext,
    exitCode: number
  ): Promise<void> {
    const success = exitCode === 0;
    const updated = await updateSession(ctx.sessionId, {
      status: success ? "done" : "error",
      errorMessage: success
        ? undefined
        : `Agent exited with code ${exitCode}`,
    });

    const content = success ? "✅ Done!" : `❌ Error: Agent exited with code ${exitCode}`;
    const agentMsg = await addMessage({
      sessionId: ctx.sessionId,
      role: success ? "agent" : "system",
      content,
      type: "agent-return",
    });

    eventBus.publish({ type: "message_added", payload: agentMsg });
    eventBus.publish({ type: "session_updated", payload: updated });
  }

  private async handleScriptExit(
    ctx: TaskContext,
    exitCode: number
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
    const nextRunning = currentRunning.filter((name) => name !== ctx.scriptName);

    if (exitCode === 0) {
      const nextStatus = nextRunning.length > 0 ? "script-running" : "done";
      const updated = await updateSession(ctx.sessionId, {
        status: nextStatus as any,
        runningScripts: nextRunning,
      });
      const doneMsg = await addMessage({
        sessionId: ctx.sessionId,
        role: "system",
        content: "✅ Script completed successfully.",
        type: "script-return",
      });
      eventBus.publish({ type: "message_added", payload: doneMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    } else {
      const errorMessage = `Script exited with code ${exitCode}`;
      const nextStatus = nextRunning.length > 0 ? "script-running" : "error";
      const updated = await updateSession(ctx.sessionId, {
        status: nextStatus as any,
        runningScripts: nextRunning,
        errorMessage,
      });
      const errMsg = await addMessage({
        sessionId: ctx.sessionId,
        role: "system",
        content: `❌ Error: ${errorMessage}`,
        type: "script-return",
      });
      eventBus.publish({ type: "message_added", payload: errMsg });
      eventBus.publish({ type: "session_updated", payload: updated });
    }
  }

  private onTaskStatus(
    controllerId: string,
    payload: {
      tasks: Array<{
        taskId: string;
        state: string;
        exitCode?: number;
      }>;
    }
  ): void {
    if (!payload.tasks) return;
    for (const t of payload.tasks) {
      if (t.state === "exited" && t.exitCode !== undefined) {
        this.onExecExit({ taskId: t.taskId, exitCode: t.exitCode }).catch((err) => {
          console.error("[controller-manager] onExecExit error:", err);
        });
      } else if (t.state === "running") {
        // Re-associate running tasks with the reporting controller
        const ctx = this.tasks.get(t.taskId);
        if (ctx && ctx.controllerId !== controllerId) {
          console.log(`[controller-manager] task.status: re-associating ${t.taskId} → ${controllerId}`);
          ctx.controllerId = controllerId;
          this.persistTasks().catch(() => {});
        }
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const p = process as typeof process & { __iteroCtrlMgr?: ControllerManager };
if (!p.__iteroCtrlMgr) {
  p.__iteroCtrlMgr = new ControllerManager();
  p.__iteroCtrlMgr.restoreControllers().catch((err) => {
    console.error("[controller-manager] failed to restore controllers:", err);
  });
  p.__iteroCtrlMgr.restoreTasks().catch((err) => {
    console.error("[controller-manager] failed to restore tasks:", err);
  });
}

export const controllerManager = p.__iteroCtrlMgr;
