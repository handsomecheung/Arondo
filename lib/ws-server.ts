import { WebSocketServer, WebSocket } from "ws";
import { eventBus, SseEvent } from "./event-bus";
import { runnerManager } from "./runner-manager";
import { ptyManager } from "./pty-manager";

const EVENT_TYPE_MAP: Record<string, string> = {
  session_updated: "session:updated",
  message_added: "message:added",
  session_deleted: "session:deleted",
  terminal_output: "terminal:output",
  terminal_exit: "terminal:exit",
};

const HEARTBEAT_INTERVAL = 30_000;

export function setupWebSocketServer(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>();

  eventBus.subscribe((event: SseEvent) => {
    const wsType = EVENT_TYPE_MAP[event.type];
    if (!wsType) return;
    const isTerminalEvent = wsType.startsWith("terminal:");
    const msg = JSON.stringify(
      isTerminalEvent
        ? { type: wsType, ...event.payload }
        : { type: wsType, payload: event.payload }
    );
    const openClients = Array.from(clients).filter((ws) => ws.readyState === WebSocket.OPEN);
    if (wsType === "terminal:output") {
      if (openClients.length === 0) {
        console.warn(`[ws-server] ${wsType} event but no connected browser clients`);
      }
    }
    for (const ws of openClients) {
      ws.send(msg);
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws) => {
    clients.add(ws);
    const shellIds = new Set<string>();
    ws.send(JSON.stringify({ type: "connected" }));

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { type, sessionId, messageId } = msg;

      switch (type) {
        case "terminal:input": {
          const taskId = runnerManager.getTaskIdByPtyKey(sessionId, messageId);
          if (!taskId) {
            console.warn(`[ws-server] terminal:input: no task for ptyKey ${sessionId}:${messageId}`);
            break;
          }
          const runnerId = runnerManager.getRunnerForTask(taskId);
          if (!runnerId) {
            console.warn(`[ws-server] terminal:input: no runner for task ${taskId}`);
            break;
          }
          runnerManager.sendFire(runnerId, "pty.input", {
            taskId,
            data: msg.data,
          });
          break;
        }
        case "terminal:resize": {
          const taskId = runnerManager.getTaskIdByPtyKey(sessionId, messageId);
          if (taskId) {
            const runnerId = runnerManager.getRunnerForTask(taskId);
            if (runnerId) {
              runnerManager.sendFire(runnerId, "pty.resize", {
                taskId,
                cols: msg.cols,
                rows: msg.rows,
              });
            }
          }
          break;
        }
        case "terminal:attach": {
          break;
        }

        case "shell:spawn": {
          const shellId = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const cwd = msg.cwd || process.cwd();
          const shell = process.env.SHELL || "/bin/bash";
          ptyManager.create(shellId, {
            command: shell,
            cwd,
            cols: msg.cols || 120,
            rows: msg.rows || 30,
            onData: (data) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "shell:output", shellId, data }));
              }
            },
            onExit: (code) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "shell:exit", shellId, code }));
              }
              shellIds.delete(shellId);
            },
          });
          shellIds.add(shellId);
          ws.send(JSON.stringify({ type: "shell:spawned", shellId }));
          break;
        }
        case "shell:input": {
          if (msg.shellId) ptyManager.write(msg.shellId, msg.data);
          break;
        }
        case "shell:resize": {
          if (msg.shellId) ptyManager.resize(msg.shellId, msg.cols, msg.rows);
          break;
        }
        case "shell:kill": {
          if (msg.shellId) {
            ptyManager.destroy(msg.shellId);
            shellIds.delete(msg.shellId);
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      for (const id of shellIds) {
        ptyManager.destroy(id);
      }
      shellIds.clear();
      clients.delete(ws);
    });
  });
}
