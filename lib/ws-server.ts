import { WebSocketServer, WebSocket } from "ws";
import { eventBus, SseEvent } from "./event-bus";
import { runnerManager } from "./runner-manager";

const shellToRunner = new Map<string, string>();

const EVENT_TYPE_MAP: Record<string, string> = {
  session_updated: "session:updated",
  message_added: "message:added",
  session_deleted: "session:deleted",
  terminal_output: "terminal:output",
  terminal_exit: "terminal:exit",
  shell_output: "shell:output",
  shell_exit: "shell:exit",
};

const HEARTBEAT_INTERVAL = 30_000;

export function setupWebSocketServer(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>();

  eventBus.subscribe((event: SseEvent) => {
    const wsType = EVENT_TYPE_MAP[event.type];
    if (!wsType) return;
    const isTerminalEvent = wsType.startsWith("terminal:");
    const isShellEvent = wsType.startsWith("shell:");
    const msg = JSON.stringify(
      isTerminalEvent || isShellEvent
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
          const runnerId = msg.runnerId ? runnerManager.resolveRunnerId(msg.runnerId) : undefined;

          if (runnerId) {
            const cwd = msg.cwd || "";
            runnerManager
              .sendRequest(runnerId, "shell.spawn", {
                taskId: shellId,
                workDir: cwd,
                cols: msg.cols || 120,
                rows: msg.rows || 30,
              })
              .then(() => {
                shellToRunner.set(shellId, runnerId);
                shellIds.add(shellId);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "shell:spawned", shellId }));
                }
              })
              .catch((err) => {
                console.error(`[ws-server] Failed to spawn shell on runner ${runnerId}:`, err);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "shell:exit", shellId, code: 1 }));
                }
              });
          } else {
            console.warn(`[ws-server] Cannot spawn shell: runner ${msg.runnerId || "unknown"} is offline or not specified`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "shell:spawned", shellId }));
              ws.send(
                JSON.stringify({
                  type: "shell:output",
                  shellId,
                  data: "\r\n\x1b[31mError: Runner is offline. Cannot open terminal.\x1b[0m\r\n",
                })
              );
              ws.send(JSON.stringify({ type: "shell:exit", shellId, code: 1 }));
            }
          }
          break;
        }
        case "shell:input": {
          if (msg.shellId) {
            const runnerId = shellToRunner.get(msg.shellId);
            if (runnerId) {
              runnerManager.sendFire(runnerId, "pty.input", {
                taskId: msg.shellId,
                data: msg.data,
              });
            }
          }
          break;
        }
        case "shell:resize": {
          if (msg.shellId) {
            const runnerId = shellToRunner.get(msg.shellId);
            if (runnerId) {
              runnerManager.sendFire(runnerId, "pty.resize", {
                taskId: msg.shellId,
                cols: msg.cols,
                rows: msg.rows,
              });
            }
          }
          break;
        }
        case "shell:kill": {
          if (msg.shellId) {
            const runnerId = shellToRunner.get(msg.shellId);
            if (runnerId) {
              runnerManager.sendFire(runnerId, "exec.cancel", {
                taskId: msg.shellId,
                signal: "SIGKILL",
              });
              shellToRunner.delete(msg.shellId);
            }
            shellIds.delete(msg.shellId);
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      for (const id of shellIds) {
        const runnerId = shellToRunner.get(id);
        if (runnerId) {
          runnerManager.sendFire(runnerId, "exec.cancel", {
            taskId: id,
            signal: "SIGKILL",
          });
          shellToRunner.delete(id);
        }
      }
      shellIds.clear();
      clients.delete(ws);
    });
  });
}
