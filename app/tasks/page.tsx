"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ScriptExecCard from "@/components/ScriptExecCard";
import AgentExecCard from "@/components/AgentExecCard";
import UserTodoMessageCard from "@/components/UserTodoMessageCard";
import {
  IconArrowLeft, IconLogo, IconX, IconInbox, IconTerminal, IconCode, IconChevronDown, IconRefresh,
} from "@/components/Icons";
import { agentTypeLabel } from "@/lib/homeUtils";
import type { TodoTrigger } from "@/types/home";

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

interface Project {
  id: string;
  repoPath: string;
  runnerId: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  type?: string;
  parentId?: string;
  createdAt: string;
  todoStatus?: string;
  todoTrigger?: TodoTrigger;
  prompt?: string;
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
  stoppedByUser?: boolean;
  command?: string;
  projectId?: string;
  prompt?: string;
  agentType?: string;
}

interface TaskItem {
  id: string;
  type: "script" | "agent";
  name: string;
  sessionId: string;
  sessionName: string;
  status: "running" | "done" | "error" | "stopped" | "todo";
  createdAt: number;
  completedAt?: number;
  messageId?: string;
  command?: string;
  scriptName?: string;
  projectId?: string;
  prompt?: string;
  agentType?: string;
  content?: string;
  trigger?: TodoTrigger;
}

function todoMessageToTaskItem(
  t: { id: string; sessionId: string; content: string; trigger: TodoTrigger; createdAt: string | number },
  sessionName?: string,
): TaskItem {
  return {
    id: t.id,
    type: "agent",
    name: `Todo: ${t.content}`,
    sessionId: t.sessionId,
    sessionName: sessionName || "",
    status: "todo",
    createdAt: typeof t.createdAt === "string" ? new Date(t.createdAt).getTime() : t.createdAt,
    content: t.content,
    trigger: t.trigger,
  };
}

interface SessionGroup {
  groupId: string;
  sessionId: string;
  sessionName: string;
  hasRunning: boolean;
  latestTime: number;
  tasks: TaskItem[];
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
  const [actionError, setActionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsInstance, setWsInstance] = useState<WebSocket | null>(null);
  const [terminalTask, setTerminalTask] = useState<TaskItem | null>(null);
  const [commandTask, setCommandTask] = useState<TaskItem | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const sessionsRef = useRef<Session[]>([]);
  const [groupBy, setGroupBy] = useState<"session" | "status">("session");
  const [filterType, setFilterType] = useState<"both" | "agent" | "script">("both");
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadInitialTasks = useCallback(async () => {
    try {
      const [tasksRes, sessionsRes, projectsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/sessions"),
        fetch("/api/projects"),
      ]);
      const serverTasks: ServerTask[] = await tasksRes.json();
      const sessions: Session[] = await sessionsRes.json();
      const projectsList: Project[] = await projectsRes.json();
      setProjects(projectsList);
      setSessions(sessions);
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
          } catch (err) {
            console.error(`Failed to load scripts for project ${pid}:`, err);
          }
        }),
      );

      let todoItems: TaskItem[] = [];
      try {
        const todoRes = await fetch("/api/todo-messages");
        const todos: { id: string; sessionId: string; sessionName?: string; content: string; trigger: TodoTrigger; createdAt: string }[] =
          await todoRes.json();
        todoItems = todos.map((t) => todoMessageToTaskItem(t, t.sessionName || sessionMap.get(t.sessionId)?.name));
      } catch {
        // ignore
      }

      const initTasks: TaskItem[] = serverTasks.map((t) => {
        const session = sessionMap.get(t.sessionId);
        let name: string;
        if (t.type === "agent") {
          name = `Agent: ${t.prompt || session?.prompt || t.sessionId}`;
        } else {
          name = `Script: ${t.scriptName || "unknown"}`;
        }
        let status: TaskItem["status"];
        if (t.completedAt) {
          status = t.stoppedByUser ? "stopped" : t.exitCode === 0 ? "done" : "error";
        } else {
          status = "running";
        }
        let command = t.command || session?.command;
        if (!command && t.type === "script" && t.scriptName && session?.projectId) {
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
          scriptName: t.scriptName,
          projectId: t.projectId || session?.projectId,
          prompt: t.prompt || session?.prompt,
          agentType: t.agentType || session?.agentType,
        };
      });

      const statusPriority = (s: TaskItem["status"]) => (s === "running" ? 0 : s === "todo" ? 1 : 2);
      const allTasks = [...initTasks, ...todoItems];
      allTasks.sort((a, b) => {
        const pa = statusPriority(a.status);
        const pb = statusPriority(b.status);
        if (pa !== pb) return pa - pb;
        const aTime = a.completedAt || a.createdAt;
        const bTime = b.completedAt || b.createdAt;
        return bTime - aTime;
      });

      setTaskQueue(allTasks);
    } catch {
      // ignore
    }
  }, []);

  // Refreshes only the "todo" slice of the task queue (pending draft/pending/
  // queued-followup/quota-retry messages) — a lightweight fallback poll in
  // case a websocket event was missed.
  const loadTodoMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/todo-messages");
      const items: { id: string; sessionId: string; sessionName?: string; content: string; trigger: TodoTrigger; createdAt: string }[] =
        await res.json();
      setTaskQueue((prev) => {
        const nonTodo = prev.filter((t) => t.status !== "todo");
        const todoItems = items.map((t) => todoMessageToTaskItem(t, t.sessionName || sessionsRef.current.find((s) => s.id === t.sessionId)?.name));
        return [...todoItems, ...nonTodo];
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadInitialTasks();
  }, [loadInitialTasks]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const interval = setInterval(loadTodoMessages, 20000);
    return () => clearInterval(interval);
  }, [loadTodoMessages]);

  const handleTodoTaskAction = useCallback(
    async (task: TaskItem, body: { action: "cancel" | "sendNow" | "changeTrigger"; trigger?: TodoTrigger }) => {
      if (body.action === "cancel") {
        setTaskQueue((prev) => prev.filter((t) => t.id !== task.id));
      }
      try {
        const res = await fetch(`/api/sessions/${task.sessionId}/todo-messages/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          loadTodoMessages();
        }
      } catch (err) {
        console.error("Failed to update todo message:", err);
        loadTodoMessages();
      }
    },
    [loadTodoMessages],
  );

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;
    let disposed = false;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
      const wsUrl = `${proto}//${location.host}/ws`;
      const protocols = token ? ["arondo-token", token] : [];
      ws = new WebSocket(wsUrl, protocols);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setWsInstance(ws);
        reconnectDelay = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        setWsInstance(null);
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
                    prompt: updated.prompt,
                    agentType: updated.agentType,
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
            if (msg.type === "user-todo" && msg.todoStatus === "pending" && msg.todoTrigger) {
              const trigger = msg.todoTrigger;
              setTaskQueue((prev) => {
                if (prev.some((t) => t.id === msg.id)) return prev;
                const sessionName = sessionsRef.current.find((s) => s.id === msg.sessionId)?.name;
                return [
                  todoMessageToTaskItem({ id: msg.id, sessionId: msg.sessionId, content: msg.content, trigger, createdAt: msg.createdAt }, sessionName),
                  ...prev,
                ];
              });
            }
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
              } else if (msg.type === "agent-return" || msg.type === "script-return") {
                const isStopped = msg.content.startsWith("🛑");
                if (isStopped && msg.parentId) {
                  const now = Date.now();
                  setTaskQueue((prev) =>
                    prev.map((t) => {
                      if (t.messageId !== msg.parentId || t.sessionId !== msg.sessionId) return t;
                      return { ...t, status: "stopped" as const, completedAt: now };
                    }),
                  );
                }
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

          if (event.type === "message:updated") {
            const msg = event.payload as Message;
            if (msg.type === "user-todo") {
              setTaskQueue((prev) => {
                if (msg.todoStatus !== "pending") {
                  return prev.filter((t) => t.id !== msg.id);
                }
                return prev.map((t) => (t.id === msg.id ? { ...t, trigger: msg.todoTrigger, content: msg.content, name: `Todo: ${msg.content}` } : t));
              });
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
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setFilterDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredTasks = taskQueue.filter((task) => {
    if (task.status === "done") return false;
    if (filterType === "both") return true;
    return task.type === filterType;
  });

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
      // Optimistic update: instantly set task status to 'stopped' to update UI
      setTaskQueue((prev) =>
        prev.map((t) => {
          if (t.id === task.id) {
            return {
              ...t,
              status: "stopped" as const,
              completedAt: Date.now(),
            };
          }
          return t;
        })
      );

      await fetch("/api/tasks/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: task.sessionId,
          messageId: task.messageId,
        }),
      });
    } catch (err) {
      setActionError("Failed to stop task. Please try again.");
      console.error("Failed to kill task:", err);
    }
  };

  const handleRestartScript = async (task: TaskItem) => {
    if (!task.scriptName || !task.messageId) return;
    try {
      const url = task.sessionId
        ? `/api/sessions/${task.sessionId}/restart-script`
        : `/api/projects/${task.projectId}/restart-script`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName: task.scriptName, messageId: task.messageId }),
      });
      // No state update needed — the runner restarts in-place, same taskId/messageId.
    } catch (err) {
      setActionError("Failed to restart script. Please try again.");
      console.error("Failed to restart script:", err);
    }
  };

  const handleRetryTask = async (task: TaskItem) => {
    try {
      let res: Response;
      if (task.type === "script" && task.scriptName) {
        if (!task.sessionId) {
          res = await fetch(`/api/projects/${task.projectId}/run-script`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptName: task.scriptName }),
          });
        } else {
          res = await fetch(`/api/sessions/${task.sessionId}/run-script`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptName: task.scriptName }),
          });
        }
      } else if (task.type === "agent" && task.sessionId) {
        res = await fetch(`/api/sessions/${task.sessionId}/rerun-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const newMessageId = data.taskId || data.messageId;
      setTaskQueue((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: "running" as const, messageId: newMessageId, completedAt: undefined, createdAt: Date.now() }
            : t
        )
      );
    } catch (err) {
      console.error("Failed to retry task:", err);
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
          <IconLogo />
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

        <button
          onClick={() => window.location.reload()}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: "var(--radius-sm)",
            transition: "all 0.2s ease",
            marginLeft: "auto",
          }}
          title="Refresh App"
          aria-label="Refresh application data"
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
        >
          <IconRefresh />
        </button>

        <div
          className={`status-dot ${connected ? "connected" : ""}`}
          style={{ marginLeft: 12 }}
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
          {actionError && (
            <div
              style={{
                background: "var(--error-bg, #3a1a1a)",
                color: "var(--error-text, #ff6b6b)",
                border: "1px solid var(--error-border, #5a2a2a)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {actionError}
              <button
                onClick={() => setActionError(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
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
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  margin: "4px 0 0 0",
                }}
              >
                Only running, failed, or stopped tasks from the last 3 days are displayed.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {filteredTasks.length > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                  }}
                >
                  {filteredTasks.filter((t) => t.status === "running").length} active / {filteredTasks.length} total
                </span>
              )}
            </div>
          </div>

          {taskQueue.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: 3,
                  gap: 2,
                  width: "fit-content",
                }}
              >
                <button
                  onClick={() => setGroupBy("session")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "calc(var(--radius-md) - 2px)",
                    border: "none",
                    background: groupBy === "session" ? "var(--bg-elevated)" : "transparent",
                    color: groupBy === "session" ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  Scope
                </button>
                <button
                  onClick={() => setGroupBy("status")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "calc(var(--radius-md) - 2px)",
                    border: "none",
                    background: groupBy === "status" ? "var(--bg-elevated)" : "transparent",
                    color: groupBy === "status" ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  Status
                </button>
              </div>

              <div
                ref={dropdownRef}
                style={{
                  position: "relative",
                  display: "inline-block",
                }}
              >
                <button
                  onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                    {filterType === "both" ? "Both" : filterType === "agent" ? "Agent" : "Script"}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      transform: filterDropdownOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                      color: "var(--text-muted)",
                    }}
                  >
                    <IconChevronDown />
                  </span>
                </button>
                {filterDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 50,
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                      padding: 4,
                      minWidth: 110,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {(["both", "agent", "script"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setFilterType(type);
                          setFilterDropdownOpen(false);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "calc(var(--radius-md) - 2px)",
                          border: "none",
                          background: filterType === type ? "var(--bg-elevated)" : "transparent",
                          color: filterType === type ? "var(--text-primary)" : "var(--text-muted)",
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {type === "both" ? "Both" : type === "agent" ? "Agent" : "Script"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {taskQueue.length === 0 ? (
            <div className="tasks-empty">
              <IconInbox size={48} />
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "12px 0 0" }}>
                No tasks
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0 0" }}>
                Only running, failed, or stopped tasks from the last 3 days are displayed.
              </p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="tasks-empty">
              <IconInbox size={48} />
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "12px 0 0" }}>
                No tasks matching the filter
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0 0" }}>
                Try switching the filter to "Both" to view all tasks.
              </p>
            </div>
          ) : (
            <div className="tasks-list" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(() => {
                if (groupBy === "session") {
                  const groupMap = new Map<string, SessionGroup>();
                  for (const task of filteredTasks) {
                    const groupKey = task.sessionId || `global-${task.projectId || "unknown"}`;
                    let group = groupMap.get(groupKey);
                    if (!group) {
                      group = {
                        groupId: groupKey,
                        sessionId: task.sessionId,
                        sessionName: task.sessionName,
                        hasRunning: false,
                        latestTime: 0,
                        tasks: [],
                      };
                      groupMap.set(groupKey, group);
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
                  return groups.map((group) => {
                    const isGlobal = !group.sessionId;
                    const projectId = group.tasks[0]?.projectId;
                    const project = projects.find((p) => p.id === projectId);
                    const projectName = project ? project.repoPath.split("/").pop() || project.repoPath : "Unknown Project";
                    return (
                      <div key={group.groupId}>
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
                          {isGlobal ? (
                            <a
                              href={`/project/${projectId}`}
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--accent)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                                textDecoration: "none",
                                cursor: "pointer",
                              }}
                              title={projectName}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              🌐 Project: {projectName}
                            </a>
                          ) : (
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
                              {group.sessionName || "Unnamed Session"}
                            </a>
                          )}
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
                            if (task.status === "todo") {
                              return (
                                <UserTodoMessageCard
                                  key={task.id}
                                  content={task.content || task.name.replace(/^Todo:\s*/, "")}
                                  trigger={task.trigger}
                                  status="pending"
                                  onCancel={() => handleTodoTaskAction(task, { action: "cancel" })}
                                  onSendNow={() => handleTodoTaskAction(task, { action: "sendNow" })}
                                  onChangeTrigger={(trigger) => handleTodoTaskAction(task, { action: "changeTrigger", trigger })}
                                />
                              );
                            }

                            const isRunning = task.status === "running";

                            let statusText: string;
                            if (isRunning) {
                              const elapsedMs = taskTimeTicker - task.createdAt;
                              statusText = `Running (${formatDuration(elapsedMs)})...`;
                            } else if (task.completedAt) {
                              const ago = formatDuration(taskTimeTicker - task.completedAt);
                              statusText = task.status === "stopped"
                                ? `Stopped by user ${ago} ago`
                                : task.status === "done"
                                  ? `Completed ${ago} ago`
                                  : `Failed ${ago} ago`;
                            } else {
                              statusText = task.status === "stopped"
                                ? "Stopped by user"
                                : task.status === "done"
                                  ? "Completed"
                                  : "Failed";
                            }

                            if (task.type === "agent") {
                              return (
                                <AgentExecCard
                                  key={task.id}
                                  item={{
                                    id: task.id,
                                    type: task.type,
                                    agentType: task.agentType,
                                    title: task.agentType ? agentTypeLabel(task.agentType) : task.name.replace(/^(Agent|Script):\s*/, ""),
                                    status: task.status,
                                    statusText,
                                    command: task.command,
                                    messageId: task.messageId,
                                  }}
                                  sessionId={task.sessionId || ""}
                                  projectId={task.projectId}
                                  ws={wsInstance}
                                  onShowCommand={task.command ? () => setCommandTask(task) : undefined}
                                  onStopTask={isRunning && task.messageId ? () => handleKillTask(task) : undefined}
                                  onRetryTask={task.status === "error" ? () => handleRetryTask(task) : undefined}
                                  onShowPrompt={task.prompt ? () => setCommandTask({ ...task, name: `Agent Prompt`, command: task.prompt }) : undefined}
                                  onViewLog={task.messageId ? () => setTerminalTask(task) : undefined}
                                />
                              );
                            }

                            return (
                              <ScriptExecCard
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
                                sessionId={task.sessionId || ""}
                                projectId={task.projectId}
                                ws={wsInstance}
                                onViewLog={task.messageId ? () => setTerminalTask(task) : undefined}
                                onShowCommand={task.command ? () => setCommandTask(task) : undefined}
                                onStopTask={isRunning && task.messageId ? () => handleKillTask(task) : undefined}
                                onRestartScript={isRunning && task.type === "script" && task.scriptName && task.messageId ? () => handleRestartScript(task) : undefined}
                                onRetryTask={task.status === "error" ? () => handleRetryTask(task) : undefined}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                } else {
                  const statusOrder: TaskItem["status"][] = ["todo", "running", "error", "done", "stopped"];
                  const statusLabels: Record<TaskItem["status"], string> = {
                    todo: "Todo",
                    running: "Running",
                    error: "Failed",
                    done: "Completed",
                    stopped: "Stopped",
                  };
                  const statusColors: Record<TaskItem["status"], string> = {
                    todo: "var(--warning)",
                    running: "var(--accent)",
                    error: "var(--error)",
                    done: "var(--success)",
                    stopped: "var(--text-muted)",
                  };

                  const groupMap = new Map<TaskItem["status"], TaskItem[]>();
                  for (const task of filteredTasks) {
                    let tasks = groupMap.get(task.status);
                    if (!tasks) {
                      tasks = [];
                      groupMap.set(task.status, tasks);
                    }
                    tasks.push(task);
                  }

                  const groups = statusOrder
                    .map((status) => ({
                      status,
                      label: statusLabels[status],
                      color: statusColors[status],
                      tasks: groupMap.get(status) || [],
                    }))
                    .filter((g) => g.tasks.length > 0);

                  return groups.map((group) => {
                    return (
                      <div key={group.status}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                            padding: "0 4px",
                          }}
                        >
                          {group.status === "running" && <span className="task-spinner" />}
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: group.color,
                              flex: 1,
                            }}
                          >
                            {group.label}
                          </span>
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
                            if (task.status === "todo") {
                              return (
                                <UserTodoMessageCard
                                  key={task.id}
                                  content={task.content || task.name.replace(/^Todo:\s*/, "")}
                                  trigger={task.trigger}
                                  status="pending"
                                  onCancel={() => handleTodoTaskAction(task, { action: "cancel" })}
                                  onSendNow={() => handleTodoTaskAction(task, { action: "sendNow" })}
                                  onChangeTrigger={(trigger) => handleTodoTaskAction(task, { action: "changeTrigger", trigger })}
                                />
                              );
                            }

                            const isRunning = task.status === "running";

                            let statusText: string;
                            if (isRunning) {
                              const elapsedMs = taskTimeTicker - task.createdAt;
                              statusText = `Running (${formatDuration(elapsedMs)})...`;
                            } else if (task.completedAt) {
                              const ago = formatDuration(taskTimeTicker - task.completedAt);
                              statusText = task.status === "stopped"
                                ? `Stopped by user ${ago} ago`
                                : task.status === "done"
                                  ? `Completed ${ago} ago`
                                  : `Failed ${ago} ago`;
                            } else {
                              statusText = task.status === "stopped"
                                ? "Stopped by user"
                                : task.status === "done"
                                  ? "Completed"
                                  : "Failed";
                            }

                            const project = projects.find((p) => p.id === task.projectId);
                            const projectName = project ? project.repoPath.split("/").pop() || project.repoPath : "Unknown Project";
                            const subtitle = task.sessionId
                              ? `Session: ${task.sessionName || "Unnamed Session"}`
                              : `Project: ${projectName}`;

                            if (task.type === "agent") {
                              return (
                                <AgentExecCard
                                  key={task.id}
                                  item={{
                                    id: task.id,
                                    type: task.type,
                                    agentType: task.agentType,
                                    title: task.agentType ? agentTypeLabel(task.agentType) : task.name.replace(/^(Agent|Script):\s*/, ""),
                                    subtitle,
                                    status: task.status,
                                    statusText,
                                    command: task.command,
                                    messageId: task.messageId,
                                  }}
                                  sessionId={task.sessionId || ""}
                                  projectId={task.projectId}
                                  ws={wsInstance}
                                  onShowCommand={task.command ? () => setCommandTask(task) : undefined}
                                  onStopTask={isRunning && task.messageId ? () => handleKillTask(task) : undefined}
                                  onRetryTask={task.status === "error" ? () => handleRetryTask(task) : undefined}
                                  onShowPrompt={task.prompt ? () => setCommandTask({ ...task, name: `Agent Prompt`, command: task.prompt }) : undefined}
                                  onViewLog={task.messageId ? () => setTerminalTask(task) : undefined}
                                />
                              );
                            }

                            return (
                              <ScriptExecCard
                                key={task.id}
                                item={{
                                  id: task.id,
                                  type: task.type,
                                  title: task.name.replace(/^(Agent|Script):\s*/, ""),
                                  subtitle,
                                  status: task.status,
                                  statusText,
                                  command: task.command,
                                  messageId: task.messageId,
                                }}
                                sessionId={task.sessionId || ""}
                                projectId={task.projectId}
                                ws={wsInstance}
                                onViewLog={task.messageId ? () => setTerminalTask(task) : undefined}
                                onShowCommand={task.command ? () => setCommandTask(task) : undefined}
                                onStopTask={isRunning && task.messageId ? () => handleKillTask(task) : undefined}
                                onRestartScript={isRunning && task.type === "script" && task.scriptName && task.messageId ? () => handleRestartScript(task) : undefined}
                                onRetryTask={task.status === "error" ? () => handleRetryTask(task) : undefined}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                }
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
                <IconTerminal size={14} strokeWidth={2.5} />
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
                projectId={terminalTask.projectId}
                messageId={terminalTask.messageId}
                ws={wsInstance}
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
