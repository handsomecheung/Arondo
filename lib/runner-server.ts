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
    let registering = false;
    // The runner client fires task.status right after register without
    // waiting for the ack, and binding a runner token now involves a file
    // read/write. Messages that land while that await is in flight get
    // queued here and replayed once runnerId is set, instead of being
    // rejected as "not a register event".
    const pendingMessages: string[] = [];
    const runnerTokenId = (req as any).runnerTokenId as string | undefined;
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
        if (registering) {
          pendingMessages.push(raw.toString());
          return;
        }

        if (msg.type === "event" && msg.method === "register") {
          if (!runnerTokenId) {
            ws.close(4001, "Missing runner token");
            return;
          }

          registering = true;
          runnerManager
            .addRunner(ws, msg.payload, remoteIp, runnerTokenId)
            .then((newRunnerId) => {
              registering = false;
              if (!newRunnerId) {
                ws.close(4003, "Runner token is bound to a different runner");
                return;
              }
              runnerId = newRunnerId;

              const ack = JSON.stringify({
                id: msg.id || "ack",
                type: "event",
                method: "connected",
                payload: {
                  runnerId,
                  serverVersion: "0.2.11",
                  // Inform the runner which binaries to detect on its PATH.
                  // The runner responds with an agent.status event.
                  queryAgents: getAgentBinaryNames(),
                },
              });
              ws.send(ack);

              for (const pending of pendingMessages) {
                runnerManager.handleMessage(runnerId!, pending);
              }
              pendingMessages.length = 0;
            })
            .catch((err) => {
              registering = false;
              console.error(`[runner-server] failed to register runner:`, err);
              ws.close(1011, "Internal error during registration");
            });
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
