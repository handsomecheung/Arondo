import "./register-env";

import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./lib/ws-server";
import { setupRunnerServer } from "./lib/runner-server";
import { startQuotaAggregator } from "./lib/quota-aggregator";

import { initializeAuth } from "./lib/auth";

const port = parseInt(process.env.PORT || (process.env.NODE_ENV === "production" ? "3250" : "3251"), 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port });
const handle = app.getRequestHandler();

initializeAuth().then(() => {
  app.prepare().then(() => {
    const server = createServer((req, res) => {
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

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/runner")) {
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

  server.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} as ${dev ? "development" : "production"}`
    );
  });
});
});
