import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./lib/ws-server";

const port = parseInt(process.env.PORT || (process.env.NODE_ENV === "production" ? "3250" : "3251"), 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  setupWebSocketServer(wss);

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // Non-/ws upgrades (e.g. Next.js HMR at /_next/webpack-hmr) are left
    // for Next.js's own upgrade handler — do NOT destroy the socket.
  });

  server.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} as ${dev ? "development" : "production"}`
    );
  });
});
