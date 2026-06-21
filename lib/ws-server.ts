import { WebSocketServer, WebSocket } from "ws";
import { eventBus, SseEvent } from "./event-bus";
import { ptyManager } from "./pty-manager";

const EVENT_TYPE_MAP: Record<string, string> = {
  session_updated: "session:updated",
  message_added: "message:added",
  session_deleted: "session:deleted",
  agent_output: "agent:output",
  terminal_output: "terminal:output",
  terminal_exit: "terminal:exit",
};

const HEARTBEAT_INTERVAL = 30_000;

export function setupWebSocketServer(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>();

  eventBus.subscribe((event: SseEvent) => {
    const wsType = EVENT_TYPE_MAP[event.type];
    if (!wsType) return;
    // Terminal events use flat structure { type, sessionId, messageId, data/code }
    // to match the format used by terminal:attach responses.
    // Session/message events keep the { type, payload } envelope.
    const isTerminalEvent = wsType.startsWith("terminal:");
    const msg = JSON.stringify(
      isTerminalEvent
        ? { type: wsType, ...event.payload }
        : { type: wsType, payload: event.payload }
    );
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
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
      const ptyId = `${sessionId}:${messageId}`;

      switch (type) {
        case "terminal:input":
          ptyManager.write(ptyId, msg.data);
          break;
        case "terminal:resize":
          ptyManager.resize(ptyId, msg.cols, msg.rows);
          break;
        case "terminal:attach": {
          const buffer = ptyManager.getBuffer(ptyId);
          if (buffer) {
            ws.send(JSON.stringify({
              type: "terminal:output",
              sessionId,
              messageId,
              data: buffer,
            }));
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });
}
