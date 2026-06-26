"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ExecCard from "@/components/ExecCard";

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
  command?: string;
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

interface ServerTask {
  taskId: string;
  runnerId: string;
  sessionId: string;
  messageId: string;
  type: "agent" | "script";
  scriptName?: string;
  pid?: number;
  createdAt: number;
  completedAt?: number;
  exitCode?: number;
}

interface TaskItem {
  id: string;
  type: "script" | "agent";
  name: string;
  sessionId: string;
  sessionName: string;
  status: "running" | "done" | "error";
  createdAt: number;
  completedAt?: number;
  messageId?: string;
  command?: string;
}

interface SessionGroup {
  sessionId: string;
  sessionName: string;
  hasRunning: boolean;
  latestTime: number;
  tasks: TaskItem[];
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

function IconCode() {
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
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
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
  const [terminalTask, setTerminalTask] = useState<TaskItem | null>(null);
  const [commandTask, setCommandTask] = useState<TaskItem | null>(null);

  const loadInitialTasks = useCallback(async () => {
    try {
      const [tasksRes, sessionsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/sessions"),
      ]);
      const serverTasks: ServerTask[] = await tasksRes.json();
      const sessions: Session[] = await sessionsRes.json();
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));

      const scriptProjectIds = new Set<string>();
      for (const t of serverTasks) {
        if (t.type === "script") {
          const session = sessionMap.get(t.sessionId);
          if (session?.projectId) scriptProjectIds.add(session.projectId);
        }
      }
      const scriptMap = new Map<string, Map<string, string>>();
      await Promise.all(
        Array.from(scriptProjectIds).map(async (pid) => {
          try {
            const res = await fetch(`/api/projects/${pid}/scripts`);
            const scripts: { name: string; command: string }[] = await res.json();
            scriptMap.set(pid, new Map(scripts.map((s) => [s.name, s.command])));
          } catch {
            // ignore
          }
        }),
      );

      const initTasks: TaskItem[] = serverTasks.map((t) => {
        const session = sessionMap.get(t.sessionId);
        let name: string;
        if (t.type === "agent") {
          name = `Agent: ${session?.prompt || t.sessionId}`;
        } else {
          name = `Script: ${t.scriptName || "unknown"}`;
        }
        let status: TaskItem["status"];
        if (t.completedAt) {
          status = t.exitCode === 0 ? "done" : "error";
        } else {
          status = "running";
        }
        let command = session?.command;
        if (t.type === "script" && t.scriptName && session?.projectId) {
          command = scriptMap.get(session.projectId)?.get(t.scriptName);
        }
        return {
          id: t.taskId,
          type: t.type,
          name,
          sessionId: t.sessionId,
          sessionName: session?.name || "",
          status,
          createdAt: t.createdAt || (session ? new Date(session.createdAt).getTime() : Date.now()),
          completedAt: t.completedAt,
          messageId: t.messageId,
          command,
        };
      });

      initTasks.sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (a.status !== "running" && b.status === "running") return 1;
        const aTime = a.completedAt || a.createdAt;
        const bTime = b.completedAt || b.createdAt;
        return bTime - aTime;
      });

      setTaskQueue(initTasks);
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
                  (t) => t.sessionId === updated.id && t.type === "agent" && t.status === "running",
                );
                if (exists) return prev;
                return [
                  {
                    id: `agent-${updated.id}-${Date.now()}`,
                    type: "agent" as const,
                    name: `Agent: ${updated.prompt}`,
                    sessionId: updated.id,
                    sessionName: updated.name || "",
                    status: "running" as const,
                    createdAt: new Date(
                      updated.updatedAt || updated.createdAt,
                    ).getTime(),
                    command: updated.command,
                  },
                  ...prev,
                ];
              });
            } else if (updated.status === "done" || updated.status === "error") {
              const now = Date.now();
              setTaskQueue((prev) =>
                prev.map((t) => {
                  if (t.sessionId !== updated.id || t.status !== "running") return t;
                  return {
                    ...t,
                    status: updated.status === "done" ? "done" as const : "error" as const,
                    completedAt: now,
                  };
                }),
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
                    const cmdMatch = msg.content.match(/```bash\n([\s\S]*?)```/);
                    const cmd = cmdMatch ? cmdMatch[1].trim() : undefined;
                    next[idx] = { ...next[idx], messageId: msg.id, command: cmd };
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

  const hasRunningTasks = taskQueue.some((t) => t.status === "running");
  useEffect(() => {
    if (taskQueue.length === 0) return;
    const interval = setInterval(() => {
      setTaskTimeTicker(Date.now());
    }, hasRunningTasks ? 1000 : 60000);
    return () => clearInterval(interval);
  }, [taskQueue.length, hasRunningTasks]);

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
          Task Queue
        </span>

        <div
          className={`status-dot ${connected ? "connected" : ""}`}
          style={{ marginLeft: "auto" }}
          suppressHydrationWarning
          title={connected ? "Connected" : "Disconnected"}
        />
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
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}
              >
                {taskQueue.filter((t) => t.status === "running").length} active / {taskQueue.length} total
              </span>
            )}
          </div>

          {taskQueue.length === 0 ? (
            <div className="tasks-empty">
              <IconInbox />
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "12px 0 0" }}>
                No tasks
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0 0" }}>
                Tasks will appear here when agents or scripts run. Records are kept for 7 days.
              </p>
            </div>
          ) : (
            <div className="tasks-list" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(() => {
                const groupMap = new Map<string, SessionGroup>();
                for (const task of taskQueue) {
                  let group = groupMap.get(task.sessionId);
                  if (!group) {
                    group = {
                      sessionId: task.sessionId,
                      sessionName: task.sessionName,
                      hasRunning: false,
                      latestTime: 0,
                      tasks: [],
                    };
                    groupMap.set(task.sessionId, group);
                  }
                  group.tasks.push(task);
                  if (task.status === "running") group.hasRunning = true;
                  const t = task.completedAt || task.createdAt;
                  if (t > group.latestTime) group.latestTime = t;
                }
                const groups = Array.from(groupMap.values());
                groups.sort((a, b) => {
                  if (a.hasRunning && !b.hasRunning) return -1;
                  if (!a.hasRunning && b.hasRunning) return 1;
                  return b.latestTime - a.latestTime;
                });
                return groups.map((group) => (
                  <div key={group.sessionId}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        padding: "0 4px",
                      }}
                    >
                      {group.hasRunning && <span className="task-spinner" />}
                      <a
                        href={`/session/${group.sessionId}`}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          textDecoration: "none",
                          cursor: "pointer",
                        }}
                        title={group.sessionName}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {group.sessionName}
                      </a>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {group.tasks.map((task) => {
                        const isRunning = task.status === "running";

                        let statusText: string;
                        if (isRunning) {
                          const elapsedMs = taskTimeTicker - task.createdAt;
                          statusText = `Running (${formatDuration(elapsedMs)})...`;
                        } else if (task.completedAt) {
                          const ago = formatDuration(taskTimeTicker - task.completedAt);
                          statusText = task.status === "done" ? `Completed ${ago} ago` : `Failed ${ago} ago`;
                        } else {
                          statusText = task.status === "done" ? "Completed" : "Failed";
                        }

                        return (
                          <ExecCard
                            key={task.id}
                            item={{
                              id: task.id,
                              type: task.type,
                              title: task.name.replace(/^(Agent|Script):\s*/, ""),
                              status: task.status,
                              statusText,
                              command: task.command,
                              messageId: task.messageId,
                            }}
                            onViewLog={task.messageId ? () => setTerminalTask(task) : undefined}
                            onShowCommand={task.command ? () => setCommandTask(task) : undefined}
                            onStopTask={isRunning && task.messageId ? () => handleKillTask(task) : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
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
                {terminalTask.status === "running" && (
                  <span
                    className="console-badge-running"
                    style={{ marginLeft: 8 }}
                  >
                    ⟳ Streaming...
                  </span>
                )}
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
                mode={terminalTask.status === "running" ? "live" : "history"}
                taskType={terminalTask.type}
              />
            </div>
          </div>
        </div>
      )}
      {commandTask && commandTask.command && (
        <div className="modal-backdrop" onClick={() => setCommandTask(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640 }}
          >
            <div className="modal-header">
              <span
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <IconCode />
                Command
              </span>
              <button
                className="modal-close-btn"
                onClick={() => setCommandTask(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body" style={{ padding: "16px 20px" }}>
              <pre
                style={{
                  margin: 0,
                  padding: "12px 16px",
                  background: "var(--bg-tertiary, #1a1a2e)",
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: "var(--text-primary, #e0e0e0)",
                }}
              >
                {commandTask.command}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
