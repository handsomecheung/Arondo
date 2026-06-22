import { WebSocketServer, WebSocket } from "ws";
import { controllerManager } from "./controller-manager";

const HEARTBEAT_INTERVAL = 30_000;

export function setupControllerServer(wss: WebSocketServer): void {
  const heartbeat = setInterval(() => {
    for (const ctrl of controllerManager.getControllers()) {
      const conn = controllerManager.getController(ctrl.id);
      if (conn?.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket) => {
    let controllerId: string | null = null;

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!controllerId) {
        if (msg.type === "event" && msg.method === "register") {
          controllerId = controllerManager.addController(ws, msg.payload);

          const ack = JSON.stringify({
            id: msg.id || "ack",
            type: "event",
            method: "connected",
            payload: {
              controllerId,
              serverVersion: "0.2.0",
            },
          });
          ws.send(ack);
          return;
        }
        ws.close(4001, "Expected register event");
        return;
      }

      try {
        controllerManager.handleMessage(controllerId, raw.toString());
      } catch (err) {
        console.error("[controller-server] handleMessage error:", err);
      }
    });

    ws.on("close", () => {
      if (controllerId) {
        controllerManager.removeController(controllerId);
      }
    });

    ws.on("error", (err) => {
      console.error(`[controller-server] ws error:`, err.message);
    });
  });
}
