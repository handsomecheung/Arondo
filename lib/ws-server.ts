import { IncomingMessage } from "http";
import url from "url";
import { WebSocketServer, WebSocket } from "ws";
import { eventBus, SseEvent } from "./event-bus";
import { runnerManager } from "./runner-manager";
import { isValidToken } from "./auth";

const shellToRunner = new Map<string, string>();
const pendingSpawns = new Map<string, Promise<any>>();

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
  const wsClients = new Map<WebSocket, string | null>();

  eventBus.subscribe((event: SseEvent) => {
    if (event.type === "session_deleted") {
      const sessionId = event.payload.id;
      if (sessionId) {
        const shellId = `shell-${sessionId}`;
        const runnerId = shellToRunner.get(shellId);
        if (runnerId) {
          runnerManager.sendFire(runnerId, "exec.cancel", {
            taskId: shellId,
            signal: "SIGKILL",
          });
          shellToRunner.delete(shellId);
        }
      }
    } else if (event.type === "shell_exit") {
      const shellId = event.payload.shellId;
      if (shellId) {
        shellToRunner.delete(shellId);
      }
    }

    const wsType = EVENT_TYPE_MAP[event.type];
    if (!wsType) return;
    const isTerminalEvent = wsType.startsWith("terminal:");
    const isShellEvent = wsType.startsWith("shell:");
    const msg = JSON.stringify(
      isTerminalEvent || isShellEvent
        ? { type: wsType, ...event.payload }
        : { type: wsType, payload: event.payload }
    );
    const openClients = Array.from(wsClients.entries()).filter(
      ([ws]) => ws.readyState === WebSocket.OPEN
    );
    if (wsType === "terminal:output") {
      if (openClients.length === 0) {
        console.warn(`[ws-server] ${wsType} event but no connected browser clients`);
      }
    }

    // Resolve runnerId for authorization checks
    let runnerId: string | undefined = event.payload.runnerId;

    const resolveAndBroadcast = async () => {
      if (!runnerId) {
        if (event.payload.sessionId) {
          const { getSession } = require("./store");
          const session = await getSession(event.payload.sessionId);
          if (session) runnerId = session.runnerId;
        } else if (event.payload.projectId) {
          const { getProject } = require("./store");
          const project = await getProject(event.payload.projectId);
          if (project) runnerId = project.runnerId;
        }
      }

      for (const [ws, clientToken] of openClients) {
        let allowed = true;
        if (runnerId) {
          allowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, clientToken);
        } else {
          allowed = !runnerManager.isTokenRequired();
        }

        if (allowed) {
          ws.send(msg);
        }
      }
    };

    resolveAndBroadcast().catch((err) => {
      console.error("[ws-server] broadcast error:", err);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wsClients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const parsedUrl = url.parse(req.url || "", true);
    const token = (parsedUrl.query.token as string) || null;
    if (!isValidToken(token)) {
      ws.close(4001, "Unauthorized: Invalid access token");
      return;
    }
    wsClients.set(ws, token);

    const shellIds = new Set<string>();
    ws.send(JSON.stringify({ type: "connected" }));

    ws.on("message", async (raw) => {
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

          const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
          if (!isAllowed) {
            console.warn(`[ws-server] unauthorized terminal:input for runner ${runnerId}`);
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
              const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
              if (!isAllowed) {
                console.warn(`[ws-server] unauthorized terminal:resize for runner ${runnerId}`);
                break;
              }

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
          const shellId = msg.sessionId
            ? `shell-${msg.sessionId}`
            : `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const runnerId = msg.runnerId ? runnerManager.resolveRunnerId(msg.runnerId) : undefined;

          if (runnerId) {
            const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
            if (!isAllowed) {
              console.warn(`[ws-server] unauthorized shell:spawn for runner ${runnerId}`);
              break;
            }

            if (pendingSpawns.has(shellId)) {
              console.warn(`[ws-server] spawn request ignored because spawning is already in progress for shell ${shellId}`);
              break;
            }

            if (shellToRunner.get(shellId) === runnerId) {
              // Shell already exists on this runner, reconnect (attach) and replay buffer
              shellIds.add(shellId);
              const promise = runnerManager
                .sendRequest(runnerId, "pty.buffer", { taskId: shellId })
                .then((res: any) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "shell:spawned", shellId }));
                  }
                  if (res && res.data) {
                    const data = Buffer.from(res.data, "base64").toString("utf-8");
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: "shell:output", shellId, data }));
                    }
                  }
                })
                .catch((err) => {
                  console.warn(`[ws-server] Failed to get PTY buffer for ${shellId}, spawning a new one:`, err.message);
                  
                  // Spawn a new shell since the previous one doesn't exist on the runner anymore
                  const cwd = msg.cwd || "";
                  return runnerManager
                    .sendRequest(runnerId, "shell.spawn", {
                      taskId: shellId,
                      workDir: cwd,
                      cols: msg.cols || 120,
                      rows: msg.rows || 30,
                    })
                    .then(() => {
                      shellToRunner.set(shellId, runnerId);
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "shell:spawned", shellId }));
                      }
                    })
                    .catch((spawnErr) => {
                      console.error(`[ws-server] Failed to spawn shell on runner ${runnerId} after buffer error:`, spawnErr);
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "shell:exit", shellId, code: 1 }));
                      }
                    });
                });

              pendingSpawns.set(shellId, promise);
              promise.finally(() => pendingSpawns.delete(shellId));
            } else {
              // Spawn a new shell
              const cwd = msg.cwd || "";
              const promise = runnerManager
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

              pendingSpawns.set(shellId, promise);
              promise.finally(() => pendingSpawns.delete(shellId));
            }
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
              const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
              if (!isAllowed) {
                console.warn(`[ws-server] unauthorized shell:input for runner ${runnerId}`);
                break;
              }

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
              const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
              if (!isAllowed) {
                console.warn(`[ws-server] unauthorized shell:resize for runner ${runnerId}`);
                break;
              }

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
              const isAllowed = await runnerManager.isTokenAllowedForRunnerId(runnerId, token);
              if (!isAllowed) {
                console.warn(`[ws-server] unauthorized shell:kill for runner ${runnerId}`);
                break;
              }

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
      shellIds.clear();
      wsClients.delete(ws);
    });
  });
}
