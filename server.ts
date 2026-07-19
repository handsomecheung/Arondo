import "./register-env";

import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./lib/ws-server";
import { setupRunnerServer } from "./lib/runner-server";
import { startQuotaAggregator, notifyQuotaAggregatorAccess } from "./lib/quota-aggregator";
import { startScheduler } from "./lib/scheduler";

import { initializeAuth, findRunnerTokenByToken } from "./lib/auth";

const port = parseInt(process.env.PORT || (process.env.NODE_ENV === "production" ? "3250" : "3251"), 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port });
const handle = app.getRequestHandler();

initializeAuth().then(() => {
  app.prepare().then(() => {
    const server = createServer((req, res) => {
    notifyQuotaAggregatorAccess();
    handle(req, res);
  });

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has("arondo-token")) {
        return "arondo-token";
      }
      return false;
    }
  });
  setupWebSocketServer(wss);

  const runnerWss = new WebSocketServer({ noServer: true });
  setupRunnerServer(runnerWss);

  server.on("upgrade", async (req, socket, head) => {
    if (req.url?.startsWith("/runner")) {
      // Header-only: a token in the URL query string would end up in proxy
      // and access logs.
      const token = (req.headers["x-runner-token"] as string) || null;
      const tokenRecord = await findRunnerTokenByToken(token);

      if (!tokenRecord) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      (req as any).runnerTokenId = tokenRecord.id;
      runnerWss.handleUpgrade(req, socket, head, (ws) => {
        runnerWss.emit("connection", ws, req);
      });
    } else if (req.url?.startsWith("/ws")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  startQuotaAggregator();
  startScheduler();

  server.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} as ${dev ? "development" : "production"}`
    );
  });
});
});
