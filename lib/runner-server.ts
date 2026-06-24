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

  wss.on("connection", (ws: WebSocket) => {
    let runnerId: string | null = null;

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!runnerId) {
        if (msg.type === "event" && msg.method === "register") {
          runnerId = runnerManager.addRunner(ws, msg.payload);

          const ack = JSON.stringify({
            id: msg.id || "ack",
            type: "event",
            method: "connected",
            payload: {
              runnerId,
              serverVersion: "0.2.0",
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

      try {
        runnerManager.handleMessage(runnerId, raw.toString());
      } catch (err) {
        console.error("[runner-server] handleMessage error:", err);
      }
    });

    ws.on("close", () => {
      if (runnerId) {
        runnerManager.removeRunner(runnerId);
      }
    });

    ws.on("error", (err) => {
      console.error(`[runner-server] ws error:`, err.message);
    });
  });
}
