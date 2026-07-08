import { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { runnerManager } from "./runner-manager";
import { getAgentBinaryNames } from "./agents";

const HEARTBEAT_INTERVAL = 30_000;

export function setupRunnerServer(wss: WebSocketServer): void {
  const heartbeat = setInterval(() => {
    for (const run of runnerManager.getRunners()) {
      const conn = runnerManager.getRunner(run.id);
      if (conn?.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    let runnerId: string | null = null;
    const remoteIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!runnerId) {
        if (msg.type === "event" && msg.method === "register") {
          runnerId = runnerManager.addRunner(ws, msg.payload, remoteIp);

          const ack = JSON.stringify({
            id: msg.id || "ack",
            type: "event",
            method: "connected",
            payload: {
              runnerId,
              serverVersion: "0.2.4",
              // Inform the runner which binaries to detect on its PATH.
              // The runner responds with an agent.status event.
              queryAgents: getAgentBinaryNames(),
            },
          });
          ws.send(ack);
          return;
        }
        ws.close(4001, "Expected register event");
        return;
      }

      runnerManager.handleMessage(runnerId, raw.toString());
    });

    ws.on("close", () => {
      if (runnerId) {
        // Guard against the race where addRunner already replaced this ws with a
        // new connection: only remove the runner if this ws is still the current one.
        const current = runnerManager.getRunner(runnerId);
        if (!current || current.ws === ws) {
          runnerManager.removeRunner(runnerId);
        }
      }
    });

    ws.on("error", (err) => {
      console.error(`[runner-server] ws error:`, err.message);
    });
  });
}
