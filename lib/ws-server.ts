import { WebSocketServer, WebSocket } from "ws";
import { eventBus, SseEvent } from "./event-bus";
import { controllerManager } from "./controller-manager";

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
          const taskId = controllerManager.getTaskIdByPtyKey(sessionId, messageId);
          if (!taskId) {
            console.warn(`[ws-server] terminal:input: no task for ptyKey ${sessionId}:${messageId}`);
            break;
          }
          const controllerId = controllerManager.getControllerForTask(taskId);
          if (!controllerId) {
            console.warn(`[ws-server] terminal:input: no controller for task ${taskId}`);
            break;
          }
          controllerManager.sendFire(controllerId, "pty.input", {
            taskId,
            data: msg.data,
          });
          break;
        }
        case "terminal:resize": {
          const taskId = controllerManager.getTaskIdByPtyKey(sessionId, messageId);
          if (taskId) {
            const controllerId = controllerManager.getControllerForTask(taskId);
            if (controllerId) {
              controllerManager.sendFire(controllerId, "pty.resize", {
                taskId,
                cols: msg.cols,
                rows: msg.rows,
              });
            }
          }
          break;
        }
        case "terminal:attach": {
          // Buffer replay is not available via controller in this version.
          // The terminal will receive live output from the stream.
          break;
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });
}
