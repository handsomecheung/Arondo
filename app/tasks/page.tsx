"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";


const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

type SessionStatus = "idle" | "running" | "script-running" | "done" | "error";

interface Session {
  id: string;
  name?: string;
  status: SessionStatus;
  prompt: string;
  agentType: string;
  repoPath: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  runningScripts?: string[];
}

interface Message {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  type?: string;
  parentId?: string;
  createdAt: string;
}

interface TaskItem {
  id: string;
  type: "script" | "agent";
  name: string;
  sessionId: string;
  status: "running" | "done" | "error";
  createdAt: number;
  messageId?: string;
}

function IconArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}

function IconMoreVertical() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function TasksPage() {
  const [taskQueue, setTaskQueue] = useState<TaskItem[]>([]);
  const [taskTimeTicker, setTaskTimeTicker] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [terminalTask, setTerminalTask] = useState<TaskItem | null>(null);

  const loadInitialTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const sessions: Session[] = await res.json();
      const running = sessions.filter(
        (s) => s.status === "running" || s.status === "script-running",
      );
      if (running.length === 0) {
        setTaskQueue([]);
        return;
      }

      const initTasks: TaskItem[] = [];
      running.forEach((s) => {
        if (s.status === "running") {
          initTasks.push({
            id: `task-${s.id}-init-agent`,
            type: "agent",
            name: `Agent: ${s.prompt}`,
            sessionId: s.id,
            status: "running",
            createdAt: new Date(s.updatedAt || s.createdAt).getTime(),
          });
        }
        if (s.status === "script-running" && s.runningScripts) {
          s.runningScripts.forEach((scriptName) => {
            initTasks.push({
              id: `task-${s.id}-init-script-${scriptName}`,
              type: "script",
              name: `Script: ${scriptName}`,
              sessionId: s.id,
              status: "running",
              createdAt: new Date(s.updatedAt || s.createdAt).getTime(),
            });
          });
        }
      });
      setTaskQueue(initTasks);

      running.forEach((s) => {
        fetch(`/api/messages?sessionId=${s.id}`)
          .then((r) => r.json())
          .then((msgs: Message[]) => {
            if (s.status === "running") {
              const lastRunMsg = [...msgs]
                .reverse()
                .find((m) => m.type === "agent-run");
              if (lastRunMsg) {
                setTaskQueue((prev) =>
                  prev.map((t) =>
                    t.sessionId === s.id && t.type === "agent" && !t.messageId
                      ? { ...t, messageId: lastRunMsg.id }
                      : t,
                  ),
                );
              }
            }
            if (s.runningScripts?.length) {
              const returnIds = new Set(
                msgs.filter((m) => m.type === "script-return" && m.parentId).map((m) => m.parentId),
              );
              const activeScriptMsgs = msgs.filter(
                (m) => m.type === "script-run" && !returnIds.has(m.id),
              );
              setTaskQueue((prev) =>
                prev.map((t) => {
                  if (t.sessionId !== s.id || t.type !== "script" || t.messageId) return t;
                  const scriptName = t.name.startsWith("Script: ")
                    ? t.name.substring(8)
                    : t.name;
                  const match = activeScriptMsgs.find((m) => {
                    const re = m.content.match(/Running script:\s*\*\*([^*]+)\*\*/i);
                    return re && re[1].trim() === scriptName;
                  });
                  return match ? { ...t, messageId: match.id } : t;
                }),
              );
            }
          })
          .catch(() => {});
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadInitialTasks();
  }, [loadInitialTasks]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;
    let disposed = false;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 10000);
            connect();
          }, reconnectDelay);
        }
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string; payload: any };

          if (event.type === "session:updated") {
            const updated = event.payload as Session;
            if (updated.status === "running") {
              setTaskQueue((prev) => {
                const exists = prev.some(
                  (t) => t.sessionId === updated.id && t.type === "agent",
                );
                if (exists) return prev;
                return [
                  ...prev,
                  {
                    id: `agent-${updated.id}-${Date.now()}`,
                    type: "agent",
                    name: `Agent: ${updated.prompt}`,
                    sessionId: updated.id,
                    status: "running",
                    createdAt: new Date(
                      updated.updatedAt || updated.createdAt,
                    ).getTime(),
                  },
                ];
              });
            } else if (updated.status === "script-running") {
              setTaskQueue((prev) =>
                prev.filter((t) => {
                  if (t.sessionId !== updated.id) return true;
                  if (t.type === "agent") return false;
                  const running = updated.runningScripts || [];
                  const scriptName = t.name.startsWith("Script: ")
                    ? t.name.substring(8)
                    : t.name;
                  return running.includes(scriptName);
                }),
              );
            } else if (
              updated.status === "done" ||
              updated.status === "error" ||
              updated.status === "idle"
            ) {
              setTaskQueue((prev) =>
                prev.filter((t) => t.sessionId !== updated.id),
              );
            }
          }

          if (event.type === "session:deleted") {
            const { id } = event.payload as { id: string };
            setTaskQueue((prev) => prev.filter((t) => t.sessionId !== id));
          }

          if (event.type === "message:added") {
            const msg = event.payload as Message;
            if (msg.role === "system") {
              if (msg.type === "agent-run") {
                setTaskQueue((prev) => {
                  const idx = prev.findIndex(
                    (t) =>
                      t.sessionId === msg.sessionId &&
                      t.type === "agent" &&
                      !t.messageId,
                  );
                  if (idx !== -1) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], messageId: msg.id };
                    return next;
                  }
                  return prev;
                });
              } else if (msg.type === "script-run") {
                setTaskQueue((prev) => {
                  let idx = -1;
                  const match = msg.content.match(
                    /Running script:\s*\*\*([^*]+)\*\*/i,
                  );
                  if (match) {
                    const sName = match[1].trim();
                    idx = prev.findIndex(
                      (t) =>
                        t.sessionId === msg.sessionId &&
                        t.type === "script" &&
                        !t.messageId &&
                        (t.name === `Script: ${sName}` || t.name === sName),
                    );
                  }
                  if (idx === -1) {
                    idx = prev.findIndex(
                      (t) =>
                        t.sessionId === msg.sessionId &&
                        t.type === "script" &&
                        !t.messageId,
                    );
                  }
                  if (idx !== -1) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], messageId: msg.id };
                    return next;
                  }
                  return prev;
                });
              }
            }
          }
        } catch {
          // ignore
        }
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (taskQueue.length === 0) return;
    const interval = setInterval(() => {
      setTaskTimeTicker(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [taskQueue.length]);

  const handleKillTask = async (task: TaskItem) => {
    if (!task.messageId) return;
    try {
      await fetch("/api/tasks/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: task.sessionId,
          messageId: task.messageId,
        }),
      });
    } catch (err) {
      console.error("Failed to kill task:", err);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openMenuId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <header className="header">
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            textDecoration: "none",
            flexShrink: 0,
            transition: "all 0.2s ease",
          }}
          title="Back to dashboard"
        >
          <IconArrowLeft />
        </Link>

        <div className="header-logo">
          <IconBolt />
          <span className="header-title">Arondo</span>
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          Running Tasks
        </span>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            className={`status-dot ${connected ? "connected" : ""}`}
            suppressHydrationWarning
          />
          <span
            style={{ fontSize: 11, color: "var(--text-muted)" }}
            suppressHydrationWarning
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Task Queue
            </h2>
            {taskQueue.length > 0 && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--accent)",
                  fontWeight: 500,
                }}
              >
                {taskQueue.length} active
              </span>
            )}
          </div>

          {taskQueue.length === 0 ? (
            <div className="tasks-empty">
              <IconInbox />
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "12px 0 0" }}>
                No running tasks
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0 0" }}>
                Tasks will appear here when agents or scripts are running.
              </p>
            </div>
          ) : (
            <div className="tasks-list">
              {taskQueue.map((task) => {
                const hasLog = !!task.messageId;
                const elapsedMs = taskTimeTicker - task.createdAt;
                const durationStr = formatDuration(elapsedMs);
                const isMenuOpen = openMenuId === task.id;

                return (
                  <div key={task.id} className="task-item-wrapper">
                    <div
                      className={`tasks-list-item ${task.type} ${hasLog ? "clickable" : "pending"}`}
                    >
                      <div className="task-queue-item-icon">
                        {task.type === "script" ? (
                          <span className="task-icon-script">&#x2699;&#xFE0F;</span>
                        ) : (
                          <span className="task-icon-agent">&#x26A1;</span>
                        )}
                      </div>
                      <div className="task-queue-item-info">
                        <div className="task-queue-item-name-row">
                          <span className="task-queue-item-name" title={task.name}>
                            {task.name}
                          </span>
                          <span className={`task-type-tag ${task.type}`}>
                            {task.type}
                          </span>
                        </div>
                        <div className="task-queue-item-status">
                          <span className="task-spinner" />
                          Running ({durationStr})...
                        </div>
                      </div>
                      <div className="task-menu-container" ref={isMenuOpen ? menuRef : undefined}>
                        <button
                          className="task-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isMenuOpen ? null : task.id);
                          }}
                          title="More actions"
                        >
                          <IconMoreVertical />
                        </button>
                        {isMenuOpen && (
                          <div className="task-menu-dropdown">
                            {hasLog && (
                              <button
                                className="task-menu-item"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setTerminalTask(task);
                                }}
                              >
                                <IconTerminal />
                                <span>Open Terminal</span>
                              </button>
                            )}
                            {hasLog && (
                              <button
                                className="task-menu-item"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  window.location.href = `/session/${task.sessionId}`;
                                }}
                              >
                                <IconExternalLink />
                                <span>Go to Session</span>
                              </button>
                            )}
                            {hasLog && (
                              <button
                                className="task-menu-item danger"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleKillTask(task);
                                }}
                              >
                                <IconStop />
                                <span>Stop Task</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {terminalTask && terminalTask.messageId && (
        <div className="modal-backdrop" onClick={() => setTerminalTask(null)}>
          <div
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ height: "70vh", display: "flex", flexDirection: "column" }}
          >
            <div className="modal-header">
              <span
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <IconTerminal />
                {terminalTask.type === "script"
                  ? "Script Execution Log"
                  : "Agent Execution Log"}
                <span
                  className="console-badge-running"
                  style={{ marginLeft: 8 }}
                >
                  ⟳ Streaming...
                </span>
              </span>
              <button
                className="modal-close-btn"
                onClick={() => setTerminalTask(null)}
                aria-label="Close terminal"
              >
                <IconX />
              </button>
            </div>
            <div
              className="modal-body"
              style={{ padding: 0, overflow: "hidden", flex: 1 }}
            >
              <Terminal
                sessionId={terminalTask.sessionId}
                messageId={terminalTask.messageId}
                ws={wsRef.current}
                mode="live"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
