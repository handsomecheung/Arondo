"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = "idle" | "running" | "script-running" | "done" | "error";

interface Session {
  id: string;
  name?: string;
  status: SessionStatus;
  prompt: string;
  agentType: string;
  repoPath: string;
  projectId: string;
  runnerId: string;
  prUrl?: string;
  errorMessage?: string;
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

interface Runner {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  connected: boolean;
  version?: string;
  capabilities?: string[];
}

interface ProjectScript {
  name: string;
  command: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  type?: string;
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconTaskQueue() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="9" x2="15" y2="9" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}


function IconSend() {
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
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

function IconExternalLink() {
  return (
    <svg
      width="12"
      height="12"
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

function IconGitPullRequest() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 012 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconGitCommit() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="22.95" y2="12" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg
      width="32"
      height="32"
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

function IconMenu() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
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

function IconFolder() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function IconCornerLeftUp() {
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
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 00-4-4H4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconMoreVertical() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function renderMessageContent(content: string) {
  if (
    content.startsWith("❌ Error:") ||
    content.startsWith("❌ Internal error:")
  ) {
    const isInternal = content.startsWith("❌ Internal error:");
    const prefix = isInternal ? "❌ Internal error:" : "❌ Error:";
    const errorDetail = content.substring(prefix.length).trim();

    return (
      <details className="error-details">
        <summary className="error-summary">
          {prefix}{" "}
          <span className="click-to-expand">(Click to show details)</span>
        </summary>
        <pre className="error-body">{errorDetail}</pre>
      </details>
    );
  }
  return content;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [agentType, setAgentType] = useState("antigravity");
  const [runnerId, setRunnerId] = useState("");
  const [runners, setRunners] = useState<Runner[]>([]);
  const [connected, setConnected] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Task Queue states
  const [taskQueue, setTaskQueue] = useState<TaskItem[]>([]);
  const [taskQueueOpen, setTaskQueueOpen] = useState(false);
  const [taskTimeTicker, setTaskTimeTicker] = useState(Date.now());
  const taskQueueRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Project states
  const [sidebarMode, setSidebarMode] = useState<"sessions" | "projects" | "runners">(
    "sessions",
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [projectScripts, setProjectScripts] = useState<ProjectScript[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    if (draggedIndex !== null) {
      wasDraggingRef.current = true;
    } else if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      if (selectedProjectId) {
        fetch(`/api/projects/${selectedProjectId}/scripts`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scripts: projectScripts }),
        }).catch((err) => {
          console.error("Failed to save reordered scripts:", err);
        });
      }
    }
  }, [draggedIndex, projectScripts, selectedProjectId]);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptName, setScriptName] = useState("");
  const [scriptCommand, setScriptCommand] = useState("");
  const [editingScriptName, setEditingScriptName] = useState<string | null>(
    null,
  );
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const [showAutoAnalyzeNotice, setShowAutoAnalyzeNotice] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "info" | "error";
  } | null>(null);
  const [apiError, setApiError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [renameModal, setRenameModal] = useState<{
    sessionId: string;
    currentName: string;
  } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [infoDialog, setInfoDialog] = useState<{
    title: string;
    body: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // File browser states
  const [fsModalOpen, setFsModalOpen] = useState(false);
  const [fsCurrentPath, setFsCurrentPath] = useState("/");
  const [fsDirectories, setFsDirectories] = useState<
    { name: string; path: string }[]
  >([]);
  const [fsParentPath, setFsParentPath] = useState<string | null>(null);
  const [fsLoading, setFsLoading] = useState(false);

  // GitHub states
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCheckingGitChanges, setIsCheckingGitChanges] = useState(false);
  const [hasGitChanges, setHasGitChanges] = useState(true);
  const [isGitRepo, setIsGitRepo] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scriptSubMenuOpen, setScriptSubMenuOpen] = useState(false);

  // Scripts for the currently selected session's project
  const [sessionScripts, setSessionScripts] = useState<ProjectScript[]>([]);
  const [isRunningScript, setIsRunningScript] = useState(false);

  // Console log state
  const [sessionLog, setSessionLog] = useState("");
  const [activeLogMsgId, setActiveLogMsgId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const activeLogMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeLogMsgIdRef.current = activeLogMsgId;
  }, [activeLogMsgId]);

  const wsRef = useRef<WebSocket | null>(null);
  const [wsInstance, setWsInstance] = useState<WebSocket | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [viewportStyles, setViewportStyles] = useState<React.CSSProperties>({});
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);

  // Handle mobile keyboard overlay by listening to visualViewport changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (vv) {
        if (window.innerWidth < 768) {
          // Adjust top and height relative to the visual viewport to prevent layout shifting
          setViewportStyles({
            height: `${vv.height}px`,
            top: `${vv.offsetTop}px`,
            position: "fixed",
            left: 0,
            right: 0,
          });
        } else {
          setViewportStyles({});
        }

        // Scroll to bottom of chat if keyboard popped up
        if (vv.height < window.innerHeight - 100) {
          setTimeout(() => {
            chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }
      }
    };

    const vv = window.visualViewport;
    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    window.addEventListener("resize", handleResize);
    
    handleResize();

    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const selectedSession =
    sessions.find((s) => s.id === selectedSessionId) ?? null;
  const isRunning =
    selectedSession?.status === "running" ||
    selectedSession?.status === "script-running";
  const isAgentRunning = taskQueue.some(
    (t) => t.sessionId === selectedSessionId && t.type === "agent",
  );

  // Close task queue dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        taskQueueRef.current &&
        !taskQueueRef.current.contains(event.target as Node)
      ) {
        setTaskQueueOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // Close session menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // Auto-close task queue if it becomes empty
  useEffect(() => {
    if (taskQueue.length === 0) {
      setTaskQueueOpen(false);
    }
  }, [taskQueue.length]);

  // Update task queue elapsed times dynamically
  useEffect(() => {
    if (!taskQueueOpen || taskQueue.length === 0) return;
    const interval = setInterval(() => {
      setTaskTimeTicker(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [taskQueueOpen, taskQueue.length]);


  // Find the ID of the last command execution system message in the list
  const lastExecMsgId = [...messages]
    .reverse()
    .find((m) => m.role === "system" && m.content.includes("⚙️"))?.id;

  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => {
        setRunners(data);
        if (data.length > 0 && !runnerId) {
          setRunnerId(data[0].id);
        }
      })
      .catch(console.error);
  }, [runnerId]);

  const loadProjects = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
      .catch(console.error);
  }, []);

  const loadProjectScripts = useCallback((projectId: string) => {
    fetch(`/api/projects/${projectId}/scripts`)
      .then((r) => r.json())
      .then((data: ProjectScript[]) => setProjectScripts(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectScripts(selectedProjectId);
      // Check if auto-script is currently running
      fetch(`/api/projects/${selectedProjectId}/auto-scripts`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "running") {
            setIsAutoAnalyzing(true);
            const tempTaskId = `auto-script-${selectedProjectId}`;
            setTaskQueue((prev) => {
              if (prev.some((t) => t.id === tempTaskId)) return prev;
              return [
                ...prev,
                {
                  id: tempTaskId,
                  type: "agent",
                  name: "Agent: Auto Scripts Analysis",
                  sessionId: "",
                  status: "running",
                  createdAt: Date.now(),
                },
              ];
            });
          }
        })
        .catch(console.error);
    } else {
      setProjectScripts([]);
    }
  }, [selectedProjectId, loadProjectScripts, setTaskQueue]);

  // Load scripts for the session's project whenever selected session changes
  useEffect(() => {
    if (selectedSession?.projectId) {
      fetch(`/api/projects/${selectedSession.projectId}/scripts`)
        .then((r) => r.json())
        .then((data: ProjectScript[]) => setSessionScripts(data))
        .catch(() => setSessionScripts([]));
    } else {
      setSessionScripts([]);
    }
  }, [selectedSession?.projectId]);

  // Toast automatic dismissal
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Poll project auto-script status while isAutoAnalyzing is active
  useEffect(() => {
    if (!isAutoAnalyzing || !selectedProjectId) return;

    let attempts = 0;
    const maxAttempts = 30; // ~2 minutes maximum polling
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setIsAutoAnalyzing(false);
        setTaskQueue((prev) => prev.filter((t) => t.id !== `auto-script-${selectedProjectId}`));
        setToast({
          message: "AI analysis background task timed out.",
          type: "error",
        });
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(
          `/api/projects/${selectedProjectId}/auto-scripts`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === "done") {
            setIsAutoAnalyzing(false);
            loadProjectScripts(selectedProjectId);
            setTaskQueue((prev) => prev.filter((t) => t.id !== `auto-script-${selectedProjectId}`));
            setToast({
              message: "AI analysis completed! New scripts are now available.",
              type: "success",
            });
            clearInterval(interval);
          } else if (data.status === "error") {
            setIsAutoAnalyzing(false);
            setTaskQueue((prev) => prev.filter((t) => t.id !== `auto-script-${selectedProjectId}`));
            setToast({
              message: `AI analysis failed. Error log written to data/auto-script-error.log`,
              type: "error",
            });
            setApiError({
              title: "AI Analysis Background Error",
              message: `${data.error || "Unknown background process error"}\n\nThe error details have been logged in "data/auto-script-error.log".`,
            });
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling auto script status:", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoAnalyzing, selectedProjectId, loadProjectScripts, setTaskQueue]);

  // ── Initial load ──
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        setSessions(data);
        if (data.length > 0) setSelectedSessionId(data[0].id);

        // Add running sessions to task queue
        const running = data.filter((s) => s.status === "running" || s.status === "script-running");
        if (running.length > 0) {
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

          // Correct the agent & script task details asynchronously by reading messages
          running.forEach((s) => {
            if (s.status === "running") {
              fetch(`/api/messages?sessionId=${s.id}`)
                .then((r) => r.json())
                .then((msgs: Message[]) => {
                  const lastRunMsg = [...msgs]
                    .reverse()
                    .find((m) => m.type === "agent-run");
                  if (lastRunMsg) {
                    setTaskQueue((prev) =>
                      prev.map((t) =>
                        t.id === `task-${s.id}-init-agent`
                          ? { ...t, name: `Agent: ${s.prompt}`, messageId: lastRunMsg.id }
                          : t,
                      ),
                    );
                  }
                })
                .catch(console.error);
            } else if (s.status === "script-running" && s.runningScripts) {
              fetch(`/api/messages?sessionId=${s.id}`)
                .then((r) => r.json())
                .then((msgs: Message[]) => {
                  s.runningScripts?.forEach((scriptName) => {
                    const matchMsg = [...msgs]
                      .reverse()
                      .find((m) => m.type === "script-run" && m.content.includes(`Running script: **${scriptName}**`));
                    if (matchMsg) {
                      setTaskQueue((prev) =>
                        prev.map((t) =>
                          t.id === `task-${s.id}-init-script-${scriptName}`
                            ? { ...t, messageId: matchMsg.id }
                            : t,
                        ),
                      );
                    }
                  });
                })
                .catch(console.error);
            }
          });
        }
      })
      .catch(console.error);

    loadProjects();
    loadRunners();

    const runnerPoll = setInterval(loadRunners, 10_000);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setGithubConfigured(!!data.githubToken))
      .catch(console.error);

    return () => clearInterval(runnerPoll);
  }, [loadProjects, loadRunners]);

  // ── Load messages for selected session ──
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }
    fetch(`/api/messages?sessionId=${selectedSessionId}`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error);
  }, [selectedSessionId]);

  // ── Load execution log for selected session and message ──
  useEffect(() => {
    if (!selectedSessionId || !activeLogMsgId) {
      setSessionLog("");
      return;
    }
    fetch(`/api/sessions/${selectedSessionId}/log?messageId=${activeLogMsgId}`)
      .then((r) => r.json())
      .then((data: { log: string }) => setSessionLog(data.log || ""))
      .catch(console.error);
  }, [selectedSessionId, activeLogMsgId]);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRunning]);

  // ── Load directories for file browser ──
  useEffect(() => {
    if (!fsModalOpen || !runnerId) return;

    setFsLoading(true);
    fetch(`/api/fs?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(fsCurrentPath)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load directories");
        return r.json();
      })
      .then((data) => {
        setFsDirectories(data.directories || []);
        setFsParentPath(data.parentPath || null);
        if (data.currentPath) {
          setFsCurrentPath(data.currentPath);
        }
      })
      .catch((err) => {
        console.error(err);
        setFsDirectories([]);
        setFsParentPath(null);
      })
      .finally(() => {
        setFsLoading(false);
      });
  }, [fsCurrentPath, fsModalOpen, runnerId]);

  // ── Close sidebar on resize to desktop ──
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Fetch git changes status when menu is opened ──
  useEffect(() => {
    if (!menuOpen || !selectedSessionId) return;

    setIsCheckingGitChanges(true);
    fetch(`/api/sessions/${selectedSessionId}/git-status`)
      .then((r) => r.json())
      .then((data) => {
        setHasGitChanges(!!data.hasChanges);
        setIsGitRepo(data.isGitRepo !== false); // default true if field absent
      })
      .catch((err) => {
        console.error("Failed to check git status:", err);
        // Default to true in case of error so the user can still attempt
        setHasGitChanges(true);
        setIsGitRepo(true);
      })
      .finally(() => {
        setIsCheckingGitChanges(false);
      });
  }, [menuOpen, selectedSessionId]);

  // ── WebSocket connection ──
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
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s)),
            );
            if (updated.status === "script-running") {
              setTaskQueue((prev) =>
                prev.filter((t) => {
                  if (t.sessionId !== updated.id) return true;
                  if (t.type === "agent") return false;
                  const running = updated.runningScripts || [];
                  const scriptName = t.name.startsWith("Script: ") ? t.name.substring(8) : t.name;
                  return running.includes(scriptName);
                })
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
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (selectedSessionId === id) {
              setSelectedSessionId(null);
              setMessages([]);
              setSessionLog("");
              setActiveLogMsgId(null);
              setLogModalOpen(false);
            }
          }

          if (event.type === "message:added") {
            const msg = event.payload as Message;
            if (msg.sessionId === selectedSessionId) {
              setMessages((prev) => {
                if (prev.find((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
            }

            if (msg.role === "system") {
              if (msg.type === "agent-run") {
                setTaskQueue((prev) => {
                  const idx = prev.findIndex(
                    (t) => t.sessionId === msg.sessionId && t.type === "agent" && !t.messageId
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
                  const match = msg.content.match(/Running script:\s*\*\*([^*]+)\*\*/i);
                  if (match) {
                    const sName = match[1].trim();
                    idx = prev.findIndex(
                      (t) =>
                        t.sessionId === msg.sessionId &&
                        t.type === "script" &&
                        !t.messageId &&
                        (t.name === `Script: ${sName}` || t.name === sName)
                    );
                  }
                  if (idx === -1) {
                    idx = prev.findIndex(
                      (t) => t.sessionId === msg.sessionId && t.type === "script" && !t.messageId
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
          /* ignore */
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      setWsInstance(null);
    };
  }, [selectedSessionId]);

  // ── Auto-resize textarea ──
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // ── Submit session ──
  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setPrompt("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      if (isNewSession || !selectedSessionId) {
        if (!repoPath.trim() || !runnerId) return;
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            repoPath: repoPath.trim(),
            agentType,
            runnerId,
          }),
        });
        const newSession: Session = await res.json();
        setTaskQueue((prev) => [
          ...prev,
          {
            id: `agent-${newSession.id}-${Date.now()}`,
            type: "agent",
            name: `Agent: ${trimmed}`,
            sessionId: newSession.id,
            status: "running",
            createdAt: Date.now(),
          },
        ]);
        setSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.id);
        setIsNewSession(false);
        setSessionLog(""); // Clear log
        setActiveLogMsgId(null);
        setLogModalOpen(false);
        loadProjects();
      } else {
        const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
        setTaskQueue((prev) => [
          ...prev,
          {
            id: tempTaskId,
            type: "agent",
            name: `Agent: ${trimmed}`,
            sessionId: selectedSessionId,
            status: "running",
            createdAt: Date.now(),
          },
        ]);
        try {
          const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed, type: "chat-user" }),
          });
          if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Failed to send message");
            setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
          }
        } catch (err) {
          console.error(err);
          setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [
    prompt,
    repoPath,
    agentType,
    runnerId,
    isNewSession,
    selectedSessionId,
    loadProjects,
    setTaskQueue,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent sending message during IME composition
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNewSession = () => {
    setSelectedSessionId(null);
    setSelectedProjectId(null);
    setSelectedRunnerId(null);
    setIsNewSession(true);
    setMessages([]);
    setSidebarOpen(false);
    setSessionLog(""); // Clear log
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleRunScript = async (scriptName: string) => {
    if (!selectedSessionId) return;
    setMenuOpen(false);
    setScriptSubMenuOpen(false);
    setIsRunningScript(true);
    const tempTaskId = `script-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      {
        id: tempTaskId,
        type: "script",
        name: `Script: ${scriptName}`,
        sessionId: selectedSessionId,
        status: "running",
        createdAt: Date.now(),
      },
    ]);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/run-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setApiError({
          title: "Run Script Error",
          message: data.error || "Failed to run script",
        });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err: any) {
      setApiError({
        title: "Run Script Error",
        message: err.message || "An error occurred while running the script.",
      });
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    } finally {
      setIsRunningScript(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSessionId(null);
    setSelectedRunnerId(null);
    setIsNewSession(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleSelectRunner = (runnerId: string) => {
    setSelectedRunnerId(runnerId);
    setSelectedProjectId(null);
    setSelectedSessionId(null);
    setIsNewSession(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleSaveScript = async () => {
    if (!selectedProjectId || !scriptName.trim() || !scriptCommand.trim())
      return;

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scriptName.trim(),
          command: scriptCommand.trim(),
          oldName: editingScriptName,
        }),
      });
      if (res.ok) {
        setScriptName("");
        setScriptCommand("");
        setEditingScriptName(null);
        setScriptModalOpen(false);
        loadProjectScripts(selectedProjectId);
      } else {
        const data = await res.json();
        setApiError({
          title: "Save Script Error",
          message: data.error || "Failed to save script",
        });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({
        title: "Save Script Error",
        message: err.message || "An error occurred while saving the script.",
      });
    }
  };

  const handleDeleteScript = async (name: string) => {
    if (!selectedProjectId) return;
    setConfirmDialog({
      message: `Delete script "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);

        try {
          const res = await fetch(
            `/api/projects/${selectedProjectId}/scripts?name=${encodeURIComponent(name)}`,
            {
              method: "DELETE",
            },
          );
          if (res.ok) {
            loadProjectScripts(selectedProjectId);
          } else {
            const data = await res.json();
            setApiError({
              title: "Delete Script Error",
              message: data.error || "Failed to delete script",
            });
          }
        } catch (err: any) {
          console.error(err);
          setApiError({
            title: "Delete Script Error",
            message:
              err.message || "An error occurred while deleting the script.",
          });
        }
      },
    });
  };

  const handleCloseScriptModal = () => {
    setScriptName("");
    setScriptCommand("");
    setEditingScriptName(null);
    setScriptModalOpen(false);
  };

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".drag-handle")) return;

    e.preventDefault();
    setDraggedIndex(index);

    const cardElement = e.currentTarget.closest(".script-card") as HTMLElement;
    if (cardElement) {
      cardElement.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggedIndex === null) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    const card = element?.closest(".script-card") as HTMLElement;
    if (card) {
      const cardIndexStr = card.getAttribute("data-index");
      if (cardIndexStr !== null) {
        const targetIndex = parseInt(cardIndexStr, 10);
        if (!isNaN(targetIndex) && targetIndex !== draggedIndex) {
          setProjectScripts((prev) => {
            const updated = [...prev];
            const [movedItem] = updated.splice(draggedIndex, 1);
            updated.splice(targetIndex, 0, movedItem);
            return updated;
          });
          setDraggedIndex(targetIndex);
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggedIndex === null) return;

    const cardElement = e.currentTarget.closest(".script-card") as HTMLElement;
    if (cardElement) {
      try {
        cardElement.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture might have already been released
      }
    }

    setDraggedIndex(null);
  };



  const handleAutoAddScripts = async () => {
    if (!selectedProjectId) return;
    setInfoDialog({
      title: "AI Auto Scripts",
      body: (
        <>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            Itero will automatically analyze your project and generate a set
            of common scripts (e.g. build, test, lint).
          </p>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingLeft: 0,
              listStyle: "none",
              margin: 0,
            }}
          >
            <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                🔍
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>
                  Scans your codebase
                </strong>{" "}
                — reads package.json, Makefile, pyproject.toml and other config
                files to detect available commands.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                ⚡
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>
                  Runs in the background
                </strong>{" "}
                — analysis is asynchronous. You can keep working; scripts will
                appear automatically once finished.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                ✏️
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>
                  Fully editable
                </strong>{" "}
                — any generated script can be renamed, edited, or deleted
                afterwards.
              </span>
            </li>
          </ul>
        </>
      ),
      confirmLabel: "Start Analysis",
      onConfirm: async () => {
        setInfoDialog(null);
        setIsAutoAnalyzing(true);
        setShowAutoAnalyzeNotice(true);
        const tempTaskId = `auto-script-${selectedProjectId}`;
        setTaskQueue((prev) => {
          if (prev.some((t) => t.id === tempTaskId)) return prev;
          return [
            ...prev,
            {
              id: tempTaskId,
              type: "agent",
              name: "Agent: Auto Scripts Analysis",
              sessionId: "",
              status: "running",
              createdAt: Date.now(),
            },
          ];
        });
        try {
          const res = await fetch(
            `/api/projects/${selectedProjectId}/auto-scripts`,
            {
              method: "POST",
            },
          );
          if (res.status === 202 || res.ok) {
            setToast({
              message:
                "AI analysis started in the background. Scripts will appear automatically once finished.",
              type: "info",
            });
          } else {
            let errorMessage = "Failed to start AI analysis.";
            try {
              const data = await res.json();
              errorMessage = data.error || errorMessage;
            } catch {
              try {
                const text = await res.text();
                errorMessage = text || errorMessage;
              } catch {}
            }
            setIsAutoAnalyzing(false);
            setShowAutoAnalyzeNotice(false);
            setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
            setApiError({
              title: "AI Analysis Error",
              message: errorMessage,
            });
          }
        } catch (err: any) {
          console.error(err);
          setIsAutoAnalyzing(false);
          setShowAutoAnalyzeNotice(false);
          setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
          setApiError({
            title: "System Error",
            message: err.message || String(err),
          });
        }
      },
    });
  };

  const handleCreatePr = async () => {
    if (!selectedSessionId || isCreatingPr) return;
    setIsCreatingPr(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/pr`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success && data.prUrl) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === selectedSessionId ? { ...s, prUrl: data.prUrl } : s,
          ),
        );
      } else {
        alert(data.error || "Failed to create pull request");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while creating pull request.");
    } finally {
      setIsCreatingPr(false);
    }
  };

  const handleCommitChanges = async () => {
    if (!selectedSessionId || isRunning || isCommitting) return;
    setIsCommitting(true);
    const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      {
        id: tempTaskId,
        type: "agent",
        name: `Agent: Commit changes`,
        sessionId: selectedSessionId,
        status: "running",
        createdAt: Date.now(),
      },
    ]);
    try {
      const commitPrompt =
        "Please commit only the changes within the current project directory with an appropriate commit message. Make sure to only stage and commit modifications under this directory, and avoid committing changes outside of it (for example, avoid using `git commit -a` which might include changes from the entire repository).";
      const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitPrompt, type: "chat-system-defined" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to commit changes");
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while calling the agent to commit changes.");
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setSelectedProjectId(null);
    setSelectedRunnerId(null);
    setIsNewSession(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    setConfirmDialog({
      message:
        "Delete this session? All messages and logs will be permanently removed.",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/sessions/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (selectedSessionId === id) {
              setSelectedSessionId(null);
              setMessages([]);
              setSessionLog("");
              setActiveLogMsgId(null);
              setLogModalOpen(false);
            }
          } else {
            const data = await res.json();
            setApiError({
              title: "Delete Session Error",
              message: data.error || "Failed to delete session",
            });
          }
        } catch (err: any) {
          console.error(err);
          setApiError({
            title: "Delete Session Error",
            message:
              err.message || "An error occurred while deleting the session.",
          });
        }
      },
    });
  };

  const handleRenameSession = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? updated : s))
        );
        setRenameModal(null);
      } else {
        const data = await res.json();
        setApiError({
          title: "Rename Session Error",
          message: data.error || "Failed to rename session",
        });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({
        title: "Rename Session Error",
        message: err.message || "An error occurred while renaming the session.",
      });
    }
  };

  const canSubmit =
    prompt.trim().length > 0 &&
    (isNewSession ? repoPath.trim().length > 0 && !!runnerId : !!selectedSessionId) &&
    !isAgentRunning;

  const activeLogMsg = messages.find((m) => m.id === activeLogMsgId);
  const isScriptLog = activeLogMsg?.type === "script-run";

  // ── Render ──
  return (
    <div className="app" style={viewportStyles}>
      {/* Header */}
      <header className="header">
        {/* Hamburger: mobile only */}
        <button
          className="menu-btn"
          onClick={() => setSidebarOpen(true)}
          id="menu-btn"
          aria-label="Open session list"
        >
          <IconMenu />
        </button>

        <div className="header-logo">
          <IconBolt />
          <span className="header-title">Itero</span>
        </div>
        <span className="header-subtitle">AI-powered dev · anywhere</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginLeft: "auto",
            position: "relative",
          }}
        >
          <div className="task-queue-wrapper" ref={taskQueueRef}>
            <button
              className={`task-queue-btn ${taskQueue.length === 0 ? "disabled" : ""} ${taskQueueOpen ? "active" : ""}`}
              onClick={() => {
                if (taskQueue.length > 0) {
                  setTaskQueueOpen(!taskQueueOpen);
                }
              }}
              disabled={taskQueue.length === 0}
              title="Task Queue"
              aria-label="View running tasks"
            >
              <IconTaskQueue />
              {taskQueue.length > 0 && (
                <span className="task-queue-badge">{taskQueue.length}</span>
              )}
            </button>

            {taskQueueOpen && taskQueue.length > 0 && (
              <div className="task-queue-dropdown">
                <div className="task-queue-dropdown-header">
                  <span>Running Tasks</span>
                  <span className="task-count">{taskQueue.length} active</span>
                </div>
                <div className="task-queue-dropdown-list">
                  {taskQueue.map((task) => {
                    const hasLog = !!task.messageId;
                    const handleTaskClick = () => {
                      if (hasLog && task.messageId) {
                        setSelectedSessionId(task.sessionId);
                        setSelectedProjectId(null);
                        setActiveLogMsgId(task.messageId);
                        setLogModalOpen(true);
                        setTaskQueueOpen(false);
                      }
                    };

                    const handleKillTask = async (e: React.MouseEvent) => {
                      e.stopPropagation();
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

                    const elapsedMs = taskTimeTicker - task.createdAt;
                    const durationStr = formatDuration(elapsedMs);

                    return (
                      <div
                        key={task.id}
                        className={`task-queue-item ${task.type} ${hasLog ? "clickable" : "pending"}`}
                        onClick={handleTaskClick}
                        title={hasLog ? "Click to view execution log" : "Initializing log..."}
                      >
                        <div className="task-queue-item-icon">
                          {task.type === "script" ? (
                            <span className="task-icon-script">⚙️</span>
                          ) : (
                            <span className="task-icon-agent">⚡</span>
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
                        {hasLog && (
                          <button
                            className="task-kill-btn"
                            onClick={handleKillTask}
                            title="Kill task"
                          >
                            <IconX />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              className={`status-dot ${connected ? "connected" : ""}`}
              suppressHydrationWarning
            />
            <span
              style={{ fontSize: 11, color: "var(--text-muted)" }}
              suppressHydrationWarning
            >
              {connected ? "Live" : "Connecting…"}
            </span>
          </div>
        </div>
      </header>

      {/* Sidebar backdrop (mobile overlay) */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header" style={{ flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sidebar-title">Menu</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="new-task-btn"
                onClick={handleNewSession}
                id="new-session-btn"
              >
                <IconPlus /> New
              </button>
              {/* Close button: mobile only */}
              <button
                className="sidebar-close-btn"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close session list"
              >
                <IconX />
              </button>
            </div>
          </div>
          <div
            className="sidebar-mode-toggle"
            role="tablist"
            aria-label="View mode"
          >
            <button
              role="tab"
              aria-selected={sidebarMode === "sessions"}
              className={`sidebar-mode-tab${sidebarMode === "sessions" ? " active" : ""}`}
              onClick={() => setSidebarMode("sessions")}
            >
              Sessions
            </button>
            <button
              role="tab"
              aria-selected={sidebarMode === "projects"}
              className={`sidebar-mode-tab${sidebarMode === "projects" ? " active" : ""}`}
              onClick={() => setSidebarMode("projects")}
            >
              Projects
            </button>
            <button
              role="tab"
              aria-selected={sidebarMode === "runners"}
              className={`sidebar-mode-tab${sidebarMode === "runners" ? " active" : ""}`}
              onClick={() => setSidebarMode("runners")}
            >
              Nodes
            </button>
          </div>
        </div>
        <div className="task-list">
          {sidebarMode === "sessions" ? (
            <>
              {sessions.length === 0 && (
                <div className="empty-state">
                  <IconInbox />
                  <p>
                    No sessions yet.
                    <br />
                    Start by creating a new session.
                  </p>
                </div>
              )}
              {sessions.map((session) => {
                const project = projects.find((p) => p.id === session.projectId);
                const projectName = project
                  ? (project.repoPath.split("/").pop() || project.repoPath)
                  : "";
                const runner = runners.find((r) => r.id === session.runnerId);
                const nodeName = runner ? runner.name : (session.runnerId || "");

                return (
                  <div
                    key={session.id}
                    className={`task-item ${selectedSessionId === session.id ? "active" : ""}`}
                    onClick={() => handleSelectSession(session.id)}
                    id={`session-item-${session.id}`}
                  >
                    <div className="task-item-header">
                      <span className={`task-status-badge ${session.status}`}>
                        {session.status === "running" && "⟳ "}
                        {session.status}
                      </span>
                      {projectName && (
                        <span
                          className="task-item-project-badge"
                          title={project?.repoPath}
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid var(--border)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            maxWidth: "120px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {projectName}
                        </span>
                      )}
                      {nodeName && (
                        <span
                          className="task-item-node-badge"
                          title={runner ? `Node: ${runner.name} (${runner.hostname})` : `Node: ${session.runnerId}`}
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid var(--border)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            maxWidth: "120px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {nodeName}
                        </span>
                      )}
                    </div>
                    <div className="task-item-prompt">{session.name || session.prompt}</div>
                    <div className="task-item-time">
                      {formatRelative(session.createdAt)}
                    </div>
                  </div>
                );
              })}
            </>
          ) : sidebarMode === "projects" ? (
            <>
              {projects.length === 0 && (
                <div className="empty-state">
                  <IconInbox />
                  <p>
                    No projects yet.
                    <br />
                    Create a session to initialize a project.
                  </p>
                </div>
              )}
              {projects.map((project) => {
                const projectSessions = sessions.filter(
                  (s) => s.projectId === project.id,
                );
                const folderName =
                  project.repoPath.split("/").pop() || project.repoPath;

                const handleSelectProjectItem = () => {
                  handleSelectProject(project.id);
                };

                return (
                  <div
                    key={project.id}
                    className={`task-item ${selectedProjectId === project.id ? "active" : ""}`}
                    onClick={handleSelectProjectItem}
                    id={`project-item-${project.id}`}
                  >
                    <div className="task-item-header">
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        {projectSessions.length} session
                        {projectSessions.length !== 1 && "s"}
                      </span>
                    </div>
                    <div
                      className="task-item-prompt"
                      style={{ fontWeight: 600 }}
                    >
                      {folderName}
                    </div>
                    <div
                      className="task-item-prompt"
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {project.repoPath}
                    </div>
                    <div className="task-item-time">
                      {formatRelative(project.createdAt)}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {runners.length === 0 && (
                <div className="empty-state">
                  <IconInbox />
                  <p>
                    No runners connected.
                  </p>
                </div>
              )}
              {runners.map((r) => (
                <div
                  key={r.id}
                  className={`task-item ${selectedRunnerId === r.id ? "active" : ""}`}
                  onClick={() => handleSelectRunner(r.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="task-item-header">
                    <span className={`task-status-badge ${r.connected ? "running" : "idle"}`}>
                      {r.connected ? "connected" : "disconnected"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginLeft: "auto",
                      }}
                    >
                      {r.os} ({r.arch})
                    </span>
                  </div>
                  <div
                    className="task-item-prompt"
                    style={{ fontWeight: 600 }}
                  >
                    {r.name}
                  </div>
                  <div
                    className="task-item-prompt"
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    Host: {r.hostname}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {selectedRunnerId ? (
          (() => {
            const runner = runners.find((r) => r.id === selectedRunnerId);
            if (!runner) return null;

            // Find all projects that use this runner
            const runnerProjects = projects.filter((p) => p.runnerId === runner.id);

            return (
              <div className="project-detail-container" style={{ padding: 24, overflowY: "auto", height: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 16,
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
                      Node: {runner.name}
                    </h2>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                      Runner system details and script configurations
                    </p>
                  </div>
                  <span className={`task-status-badge ${runner.connected ? "running" : "idle"}`} style={{ padding: "4px 10px", fontSize: 12 }}>
                    {runner.connected ? "Active / Connected" : "Disconnected"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 16,
                    marginBottom: 24,
                  }}
                >
                  {/* Node Info Box */}
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                    }}
                  >
                    <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 12 }}>
                      System Information
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Host Name</span>
                        <code style={{ fontSize: 12, color: "var(--text-primary)" }}>{runner.hostname || "N/A"}</code>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>OS / Platform</span>
                        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{runner.os} ({runner.arch})</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Agent Version</span>
                        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{runner.version || "0.1.0"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Capabilities Box */}
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                    }}
                  >
                    <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 12 }}>
                      Capabilities
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {runner.capabilities && runner.capabilities.length > 0 ? (
                        runner.capabilities.map((cap) => (
                          <span
                            key={cap}
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "var(--accent)",
                              background: "var(--accent-glow)",
                              border: "1px solid var(--border-accent)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            {cap}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Standard terminal execution</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Projects & Scripts Section */}
                <div className="project-section-block">
                  <div className="project-section-header" style={{ marginBottom: 16 }}>
                    <h3 className="project-section-title">Associated Projects & Scripts</h3>
                  </div>
                  
                  {runnerProjects.length === 0 ? (
                    <div
                      style={{
                        padding: "40px 16px",
                        textAlign: "center",
                        border: "1px dashed var(--border)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      No active projects are configured for this node.
                      <br />
                      Create a new project session selecting this runner node.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {runnerProjects.map((project) => {
                        const projSessions = sessions.filter((s) => s.projectId === project.id);
                        const folderName = project.repoPath.split("/").pop() || project.repoPath;

                        return (
                          <div
                            key={project.id}
                            style={{
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-md)",
                              padding: 16,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                borderBottom: "1px solid var(--border)",
                                paddingBottom: 10,
                                marginBottom: 12,
                              }}
                            >
                              <div>
                                <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                                  {folderName}
                                </h4>
                                <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.repoPath}</code>
                              </div>
                              <button
                                className="new-task-btn"
                                onClick={() => handleSelectProject(project.id)}
                                style={{ padding: "4px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--border)" }}
                              >
                                View Project Scripts
                              </button>
                            </div>
                            <div style={{ display: "flex", gap: 16 }}>
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                <strong>Sessions:</strong> {projSessions.length} total
                              </span>
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                <strong>Status:</strong> Active
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : selectedProjectId ? (
          (() => {
            const project = projects.find((p) => p.id === selectedProjectId);
            if (!project) return null;
            const projectSessions = sessions.filter(
              (s) => s.projectId === project.id,
            );
            const folderName =
              project.repoPath.split("/").pop() || project.repoPath;

            return (
              <div className="project-detail-container">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 16,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {folderName}
                    </h2>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      Project details and scripts
                    </p>
                  </div>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <button
                      className="new-task-btn"
                      onClick={() => {
                        setRepoPath(project.repoPath);
                        handleNewSession();
                        setSidebarMode("sessions");
                      }}
                      style={{ padding: "8px 16px", fontSize: 13 }}
                    >
                      <IconPlus /> New Session
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-secondary)",
                        marginBottom: 12,
                      }}
                    >
                      Project Info
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            display: "block",
                          }}
                        >
                          PATH
                        </span>
                        <code
                          style={{
                            fontSize: 12,
                            color: "var(--accent)",
                            wordBreak: "break-all",
                          }}
                        >
                          {project.repoPath}
                        </code>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            display: "block",
                          }}
                        >
                          PROJECT ID
                        </span>
                        <code
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {project.id}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-secondary)",
                        marginBottom: 12,
                      }}
                    >
                      Metadata
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            display: "block",
                          }}
                        >
                          CREATED AT
                        </span>
                        <span
                          style={{ fontSize: 13, color: "var(--text-primary)" }}
                        >
                          {new Date(project.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            display: "block",
                          }}
                        >
                          SESSIONS
                        </span>
                        <span
                          style={{ fontSize: 13, color: "var(--text-primary)" }}
                        >
                          {projectSessions.length} total sessions
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Scripts block ─────────────────────────────── */}
                <div className="project-section-block">
                  <div className="project-section-header">
                    <h3 className="project-section-title">Scripts</h3>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <button
                        className="new-task-btn"
                        onClick={handleAutoAddScripts}
                        style={{
                          padding: "6px 14px",
                          fontSize: 12,
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--accent)",
                        }}
                      >
                        🤖 AI Auto Scripts
                      </button>
                      <button
                        className="new-task-btn"
                        onClick={() => setScriptModalOpen(true)}
                        style={{
                          padding: "6px 14px",
                          fontSize: 12,
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <IconPlus /> Add Script
                      </button>
                    </div>
                  </div>
                  <div className="project-section-body">
                    {isAutoAnalyzing && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 14px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-secondary)",
                          fontSize: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          className="spinner"
                          style={{ width: 14, height: 14, borderWidth: 2 }}
                        />
                        <span>
                          🤖 AI is analyzing files to automatically generate
                          scripts in the background...
                        </span>
                      </div>
                    )}
                    {projectScripts.length === 0 ? (
                      <div
                        style={{
                          padding: "24px 16px",
                          textAlign: "center",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius-md)",
                          color: "var(--text-muted)",
                          fontSize: 13,
                        }}
                      >
                        No scripts added yet.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 12,
                        }}
                      >
                        {projectScripts.map((script, sidx) => (
                          <div
                            key={script.name}
                            className="script-card"
                            data-index={sidx}
                            style={{
                              padding: 12,
                              background: draggedIndex === sidx ? "var(--bg-surface)" : "var(--bg-elevated)",
                              border: draggedIndex === sidx ? "1px dashed var(--accent)" : "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              opacity: draggedIndex === sidx ? 0.6 : 1,
                              transform: draggedIndex === sidx ? "scale(1.02)" : "scale(1)",
                              transition: "transform 0.1s, opacity 0.1s, background 0.1s, border 0.1s",
                              position: "relative",
                              zIndex: draggedIndex === sidx ? 10 : 1,
                            }}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                  marginRight: 8,
                                }}
                              >
                                <div
                                  className="drag-handle"
                                  onPointerDown={(e) => handlePointerDown(e, sidx)}
                                  style={{
                                    cursor: draggedIndex === sidx ? "grabbing" : "grab",
                                    userSelect: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    paddingRight: 6,
                                    color: draggedIndex === sidx ? "var(--accent)" : "var(--text-muted)",
                                    transition: "color 0.2s",
                                    touchAction: "none",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (draggedIndex !== sidx) {
                                      e.currentTarget.style.color = "var(--text-secondary)";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (draggedIndex !== sidx) {
                                      e.currentTarget.style.color = "var(--text-muted)";
                                    }
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="9" cy="5" r="1.5" />
                                    <circle cx="9" cy="12" r="1.5" />
                                    <circle cx="9" cy="19" r="1.5" />
                                    <circle cx="15" cy="5" r="1.5" />
                                    <circle cx="15" cy="12" r="1.5" />
                                    <circle cx="15" cy="19" r="1.5" />
                                  </svg>
                                </div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    fontSize: 13,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={script.name}
                                >
                                  {script.name}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  onClick={() => {
                                    setScriptName(script.name);
                                    setScriptCommand(script.command);
                                    setEditingScriptName(script.name);
                                    setScriptModalOpen(true);
                                  }}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    padding: "2px 6px",
                                    borderRadius: "var(--radius-sm)",
                                    transition: "background 0.2s, color 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color =
                                      "var(--text-primary)";
                                    e.currentTarget.style.background =
                                      "var(--bg-surface)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color =
                                      "var(--text-secondary)";
                                    e.currentTarget.style.background =
                                      "transparent";
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteScript(script.name)
                                  }
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--error)",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    padding: "2px 6px",
                                    borderRadius: "var(--radius-sm)",
                                    transition: "background 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                      "var(--error-bg)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      "transparent";
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <code
                              style={{
                                display: "block",
                                background: "var(--bg-base)",
                                padding: "4px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                color: "var(--text-secondary)",
                                marginTop: 6,
                                wordBreak: "break-all",
                                fontFamily: "monospace",
                              }}
                            >
                              {script.command}
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Sessions block ────────────────────────────── */}
                <div className="project-section-block">
                  <div className="project-section-header">
                    <h3 className="project-section-title">Sessions</h3>
                    <span className="project-section-count">
                      {projectSessions.length}
                    </span>
                  </div>
                  <div className="project-section-body">
                    {projectSessions.length === 0 ? (
                      <div
                        style={{
                          padding: "32px 16px",
                          textAlign: "center",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius-md)",
                          color: "var(--text-muted)",
                        }}
                      >
                        No sessions created for this project yet.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {projectSessions.map((session) => (
                          <div
                            key={session.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: 12,
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onClick={() => handleSelectSession(session.id)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-surface)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-elevated)";
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span
                                  className={`task-status-badge ${session.status}`}
                                >
                                  {session.status}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: 13,
                                  color: "var(--text-primary)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {session.name || session.prompt}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginLeft: 16,
                              }}
                            >
                              {new Date(session.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            {/* Session info bar */}
            {selectedSession && (
              <div
                className="task-info-bar"
                style={{
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 16px",
                  minHeight: "56px",
                }}
              >
                <span className={`task-status-badge ${selectedSession.status}`}>
                  {selectedSession.status === "running" && "⟳ "}
                  {selectedSession.status === "running"
                    ? "Agent working…"
                    : selectedSession.status}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    className="task-info-prompt"
                    style={{
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedSession.name || selectedSession.prompt}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Project: {selectedSession.repoPath} (
                    {selectedSession.agentType})
                  </span>
                </div>

                <div
                  ref={menuRef}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    position: "relative",
                  }}
                >
                  <button
                    className="menu-trigger-btn"
                    onClick={() => setMenuOpen(!menuOpen)}
                    id="session-menu-btn"
                    title="Session Menu"
                  >
                    <IconMoreVertical />
                  </button>

                  {menuOpen && (
                    <div className="session-dropdown-menu">
                      {/* Show Diff — requires git repo */}
                      {!isGitRepo ? (
                        <button
                          className="menu-item"
                          disabled={true}
                          id="menu-show-diff"
                          title="Not a git repository"
                        >
                          🔍 Show Diff
                        </button>
                      ) : isCheckingGitChanges || !hasGitChanges ? (
                        <button
                          className="menu-item"
                          disabled={true}
                          id="menu-show-diff"
                          title={
                            isCheckingGitChanges
                              ? "Checking git changes..."
                              : "No changes detected in git repository"
                          }
                        >
                          🔍 Show Diff
                        </button>
                      ) : (
                        <a
                          href={`/api/sessions/${selectedSessionId}/diff`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="menu-item"
                          onClick={() => setMenuOpen(false)}
                          id="menu-show-diff"
                        >
                          🔍 Show Diff
                        </a>
                      )}

                      {/* Commit Changes — requires git repo */}
                      <button
                        className="menu-item"
                        onClick={() => {
                          handleCommitChanges();
                          setMenuOpen(false);
                        }}
                        disabled={
                          !isGitRepo ||
                          isRunning ||
                          isCommitting ||
                          isCheckingGitChanges ||
                          !hasGitChanges
                        }
                        title={
                          !isGitRepo
                            ? "Not a git repository"
                            : isRunning
                            ? "Agent is running"
                            : isCommitting
                            ? "Committing changes in progress..."
                            : isCheckingGitChanges
                            ? "Checking git changes..."
                            : !hasGitChanges
                            ? "No changes to commit"
                            : undefined
                        }
                        id="menu-commit-changes"
                      >
                        <IconGitCommit />{" "}
                        {isCommitting
                          ? "Committing Changes…"
                          : "Commit Changes"}
                      </button>

                      {/* Create PR / View PR — requires git repo */}
                      {selectedSession.prUrl ? (
                        <a
                          href={selectedSession.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="menu-item"
                          onClick={() => setMenuOpen(false)}
                          id="menu-view-pr"
                        >
                          <IconGitPullRequest /> View PR
                        </a>
                      ) : (
                        selectedSession.status === "done" && (
                          <button
                            className="menu-item"
                            onClick={() => {
                              handleCreatePr();
                              setMenuOpen(false);
                            }}
                            disabled={!isGitRepo || !githubConfigured || isCreatingPr}
                            title={
                              !isGitRepo
                                ? "Not a git repository"
                                : !githubConfigured
                                ? "GitHub not configured"
                                : isCreatingPr
                                ? "Creating pull request in progress..."
                                : undefined
                            }
                            id="menu-create-pr"
                          >
                            <IconGitPullRequest />{" "}
                            {isCreatingPr ? "Creating PR…" : "Create PR"}
                          </button>
                        )
                      )}

                      {/* Run Script — submenu */}
                      {sessionScripts.length > 0 && (
                        <div
                          className="menu-item-with-sub"
                          onMouseEnter={() => setScriptSubMenuOpen(true)}
                          onMouseLeave={() => setScriptSubMenuOpen(false)}
                        >
                          <button
                            className="menu-item"
                            disabled={isAgentRunning}
                            title={isAgentRunning ? "Agent is running" : undefined}
                            id="menu-run-script"
                          >
                            <IconPlay /> Run Script
                            <span className="menu-item-arrow">›</span>
                          </button>
                          {scriptSubMenuOpen && (
                            <div className="script-submenu">
                              {sessionScripts.map((s) => (
                                <button
                                  key={s.name}
                                  className="menu-item"
                                  onClick={() => handleRunScript(s.name)}
                                  disabled={selectedSession?.runningScripts?.includes(s.name)}
                                  id={`menu-run-script-${s.name.replace(/\s+/g, "-")}`}
                                  title={
                                    selectedSession?.runningScripts?.includes(s.name)
                                      ? "Script is already running"
                                      : s.command
                                  }
                                >
                                  {s.name}
                                </button>
                              ))}
                              <div className="script-submenu-divider" />
                              <button
                                className="menu-item script-submenu-manage"
                                id="menu-manage-scripts"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setScriptSubMenuOpen(false);
                                  setSelectedProjectId(selectedSession.projectId);
                                  setSidebarMode("projects");
                                  setSidebarOpen(true);
                                }}
                              >
                                ⚙ Edit Scripts
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rename Session */}
                      <button
                        className="menu-item"
                        onClick={() => {
                          setRenameModal({
                            sessionId: selectedSessionId!,
                            currentName: selectedSession.name || selectedSession.prompt,
                          });
                          setRenameInput(selectedSession.name || selectedSession.prompt);
                          setMenuOpen(false);
                        }}
                        id="menu-rename-session"
                      >
                        <IconEdit /> Rename Session
                      </button>

                      {/* Delete Session */}
                      <button
                        className="menu-item delete"
                        onClick={() => {
                          handleDeleteSession(selectedSessionId!);
                          setMenuOpen(false);
                        }}
                        disabled={selectedSession.status === "running"}
                        title={
                          selectedSession.status === "running"
                            ? "Cannot delete a running session"
                            : undefined
                        }
                        id="menu-delete-session"
                      >
                        <IconTrash /> Delete Session
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chat area */}
            <div className="chat-area" id="chat-area">
              {!selectedSession && !isNewSession && (
                <div className="welcome-screen">
                  <div className="welcome-icon">
                    <IconBolt />
                  </div>
                  <h1 className="welcome-title">Welcome to Itero</h1>
                  <p className="welcome-desc">
                    Delegate coding tasks to AI agents, review GitHub PRs on
                    your phone, and ship software from anywhere — no laptop
                    required.
                  </p>
                  <button
                    className="new-task-btn"
                    onClick={handleNewSession}
                    style={{ padding: "8px 16px", fontSize: 13 }}
                  >
                    <IconPlus /> Create your first session
                  </button>
                </div>
              )}

              {(selectedSession || isNewSession) &&
                messages.length === 0 &&
                !isRunning && (
                  <div className="welcome-screen">
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {isNewSession
                        ? "Describe what you want the agent to do…"
                        : "No messages yet."}
                    </p>
                  </div>
                )}

              {messages.map((msg, idx) => {
                const isCommandExec =
                  msg.role === "system" && msg.content.includes("⚙️");
                const isThisMsgRunning =
                  isRunning && isCommandExec && msg.id === lastExecMsgId;

                return (
                  <div key={msg.id} style={{ display: "contents" }}>
                    <div className={`message ${msg.role}`}>
                      <div className="message-avatar">
                        {msg.role === "user"
                          ? "U"
                          : msg.role === "agent"
                            ? "AI"
                            : "⚙"}
                      </div>
                      <div>
                        <div className="message-bubble">
                          {renderMessageContent(msg.content)}
                        </div>
                        <div className="message-time">
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                    {isCommandExec && (
                      <button
                        className="console-trigger-btn"
                        onClick={() => {
                          setActiveLogMsgId(msg.id);
                          setLogModalOpen(true);
                        }}
                      >
                        {msg.type === "script-run" ? <IconPlay /> : <IconBolt />}
                        <span>
                          {msg.type === "script-run"
                            ? "Script Execution Log"
                            : "Agent Execution Log"}
                        </span>
                        {isThisMsgRunning && (
                          <span className="console-badge-running">
                            ⟳ Streaming...
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}

              {isAgentRunning && (
                <div className="typing-indicator">
                  <div
                    className="message-avatar"
                    style={{
                      background: "var(--success-bg)",
                      border: "1px solid rgba(34, 211, 165, 0.2)",
                      color: "var(--success)",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    AI
                  </div>
                  <div className="typing-bubble">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input area */}
            <div className="input-area">
              {isNewSession && (
                <div className="input-meta">
                  <span className="input-label">Runner:</span>
                  <select
                    className="agent-select"
                    value={runnerId}
                    onChange={(e) => {
                      setRunnerId(e.target.value);
                      setRepoPath("");
                    }}
                    disabled={isRunning}
                    id="runner-select"
                  >
                    {runners.length === 0 && (
                      <option value="">No runners connected</option>
                    )}
                    {runners.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.hostname})
                      </option>
                    ))}
                  </select>
                  <span className="input-label">Project:</span>
                  <div
                    style={{ display: "flex", flex: 1, gap: 6, minWidth: 0 }}
                  >
                    <input
                      className="input-field-sm"
                      type="text"
                      placeholder={runnerId ? "Click to select project directory…" : "Select a runner first"}
                      value={repoPath}
                      readOnly
                      onClick={() => {
                        if (!runnerId) return;
                        const startingPath = repoPath.trim() || "/";
                        setFsCurrentPath(startingPath);
                        setFsModalOpen(true);
                      }}
                      style={{ cursor: "pointer" }}
                      disabled={isRunning || !runnerId}
                      id="repo-path-input"
                    />
                    <button
                      type="button"
                      className="browse-btn"
                      onClick={() => {
                        if (!runnerId) return;
                        const startingPath = repoPath.trim() || "/";
                        setFsCurrentPath(startingPath);
                        setFsModalOpen(true);
                      }}
                      disabled={isRunning || !runnerId}
                      title="Browse Directory"
                      id="browse-repo-btn"
                    >
                      <IconFolder />
                    </button>
                  </div>
                  <select
                    className="agent-select"
                    value={agentType}
                    onChange={(e) => setAgentType(e.target.value)}
                    disabled={isRunning}
                    id="agent-select"
                  >
                    <option value="antigravity">Antigravity CLI</option>
                    <option value="gemini">Gemini CLI</option>
                  </select>
                </div>
              )}
              <div className="input-row">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  placeholder={
                    isAgentRunning
                      ? "Agent is working…"
                      : isNewSession
                        ? "Describe what you want the agent to build or fix in this project…"
                        : "Send a message or follow-up feedback to the agent…"
                  }
                  value={prompt}
                  onChange={handlePromptChange}
                  onKeyDown={handleKeyDown}
                  disabled={isAgentRunning}
                  rows={1}
                  id="chat-input"
                />
                <button
                  className="send-btn"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  title="Send (Ctrl+Enter / ⌘+Enter)"
                  id="send-btn"
                >
                  <IconSend />
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* File Explorer Modal */}
      {fsModalOpen && (
        <div className="modal-backdrop" onClick={() => setFsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Select Project Directory</span>
              <button
                className="modal-close-btn"
                onClick={() => setFsModalOpen(false)}
                aria-label="Close modal"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              <div className="fs-current-path">{fsCurrentPath}</div>
              <div className="fs-list">
                {fsParentPath !== null && (
                  <div
                    className="fs-item fs-parent"
                    onClick={() => setFsCurrentPath(fsParentPath)}
                  >
                    <span className="fs-item-icon">
                      <IconCornerLeftUp />
                    </span>
                    <span className="fs-item-name">.. (Go Up)</span>
                  </div>
                )}
                {fsLoading ? (
                  <div
                    style={{
                      padding: "20px 0",
                      textAlign: "center",
                      color: "var(--text-secondary)",
                      fontSize: 13,
                    }}
                  >
                    Loading directories…
                  </div>
                ) : fsDirectories.length === 0 ? (
                  <div
                    style={{
                      padding: "20px 0",
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    No directories found.
                  </div>
                ) : (
                  fsDirectories.map((dir) => (
                    <div
                      key={dir.path}
                      className="fs-item"
                      onClick={() => setFsCurrentPath(dir.path)}
                    >
                      <span className="fs-item-icon">
                        <IconFolder />
                      </span>
                      <span className="fs-item-name" title={dir.name}>
                        {dir.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn-secondary"
                onClick={() => setFsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn-primary"
                onClick={() => {
                  setRepoPath(fsCurrentPath);
                  setFsModalOpen(false);
                }}
              >
                Select Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Console Modal */}
      {logModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setLogModalOpen(false);
            setActiveLogMsgId(null);
          }}
        >
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {isScriptLog ? <IconPlay /> : <IconBolt />}
                {isScriptLog ? "Script Execution Log" : "Agent Execution Log"}
                {isRunning && activeLogMsgId === lastExecMsgId && (
                  <span className="console-badge-running" style={{ marginLeft: 8 }}>
                    ⟳ Streaming...
                  </span>
                )}
              </span>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setLogModalOpen(false);
                  setActiveLogMsgId(null);
                }}
                aria-label="Close modal"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0, overflow: "hidden" }}>
              {activeLogMsgId ? (
                <Terminal
                  sessionId={selectedSessionId!}
                  messageId={activeLogMsgId}
                  ws={wsInstance}
                  mode={isRunning && activeLogMsgId === lastExecMsgId ? "live" : "history"}
                  historyLog={isRunning && activeLogMsgId === lastExecMsgId ? undefined : sessionLog}
                />
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn-secondary"
                onClick={() => {
                  setLogModalOpen(false);
                  setActiveLogMsgId(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Script Modal */}
      {scriptModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseScriptModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "480px" }}
          >
            <div className="modal-header">
              <span className="modal-title">
                {editingScriptName ? "Edit Script" : "Add Script"}
              </span>
              <button
                className="modal-close-btn"
                onClick={handleCloseScriptModal}
                aria-label="Close modal"
              >
                <IconX />
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "20px 16px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. build, test, lint"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    outline: "none",
                  }}
                  id="script-name-input"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  Command
                </label>
                <input
                  type="text"
                  placeholder="e.g. npm run build, pytest"
                  value={scriptCommand}
                  onChange={(e) => setScriptCommand(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    outline: "none",
                  }}
                  id="script-command-input"
                />
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                padding: "12px 16px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                onClick={handleCloseScriptModal}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScript}
                disabled={!scriptName.trim() || !scriptCommand.trim()}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "#ffffff",
                  fontSize: 13,
                  cursor: "pointer",
                  opacity:
                    !scriptName.trim() || !scriptCommand.trim() ? 0.5 : 1,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Auto Analyzing Notice Modal */}
      {showAutoAnalyzeNotice && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAutoAnalyzeNotice(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "380px", padding: 24, textAlign: "center" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div className="spinner" />
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  AI Background Analysis
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 8,
                    lineHeight: "1.5",
                  }}
                >
                  Analyzing project structure in the background. New scripts
                  will appear automatically on this page once finished.
                </p>
                <p
                  style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}
                >
                  You can safely close this notification now.
                </p>
              </div>
              <button
                onClick={() => setShowAutoAnalyzeNotice(false)}
                style={{
                  marginTop: 8,
                  padding: "8px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "#ffffff",
                  fontSize: 13,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background:
              toast.type === "error"
                ? "var(--error)"
                : toast.type === "success"
                  ? "#10b981"
                  : "var(--bg-elevated)",
            color:
              toast.type === "error" || toast.type === "success"
                ? "#ffffff"
                : "var(--text-primary)",
            border: toast.type === "info" ? "1px solid var(--border)" : "none",
            borderRadius: "var(--radius-md)",
            padding: "12px 20px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            zIndex: 9999,
            maxWidth: "380px",
          }}
        >
          <span style={{ fontSize: 16 }}>
            {toast.type === "success"
              ? "✅"
              : toast.type === "error"
                ? "❌"
                : "ℹ️"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
            {toast.message}
          </span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color:
                toast.type === "error" || toast.type === "success"
                  ? "rgba(255, 255, 255, 0.8)"
                  : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
              marginLeft: 8,
              display: "flex",
              alignItems: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* API Error Details Modal */}
      {apiError && (
        <div className="modal-backdrop" onClick={() => setApiError(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "540px" }}
          >
            <div className="modal-header">
              <span
                className="modal-title"
                style={{
                  color: "var(--error)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ⚠️ {apiError.title}
              </span>
              <button
                className="modal-close-btn"
                onClick={() => setApiError(null)}
                aria-label="Close modal"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body" style={{ padding: "20px 16px" }}>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-primary)",
                  marginBottom: 12,
                }}
              >
                An error occurred during the operations:
              </p>
              <pre
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  maxHeight: "260px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontFamily: "monospace",
                }}
              >
                {apiError.message}
              </pre>
            </div>
            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "12px 16px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                className="new-task-btn"
                onClick={() => setApiError(null)}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "#ffffff",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Session Dialog */}
      {renameModal && (
        <div className="modal-backdrop" onClick={() => setRenameModal(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "450px" }}
          >
            <div className="modal-header">
              <span className="modal-title">Rename Session</span>
              <button
                className="modal-close-btn"
                onClick={() => setRenameModal(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body" style={{ padding: "20px 16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="rename-session-input"
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  Session Name
                </label>
                <input
                  id="rename-session-input"
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  placeholder="Enter session name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameInput.trim()) {
                      handleRenameSession(renameModal.sessionId, renameInput.trim());
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="modal-btn-secondary"
                onClick={() => setRenameModal(null)}
              >
                Cancel
              </button>
              <button
                className="modal-btn-primary"
                onClick={() => handleRenameSession(renameModal.sessionId, renameInput.trim())}
                disabled={!renameInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div
            className="modal confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="confirm-dialog-body">
              <div className="confirm-dialog-icon">
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
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </div>
              <div className="confirm-dialog-content">
                <p className="confirm-dialog-title">Confirm Delete</p>
                <p className="confirm-dialog-message">
                  {confirmDialog.message}
                </p>
              </div>
            </div>
            <div className="confirm-dialog-footer">
              <button
                className="modal-btn-secondary"
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                className="modal-btn-danger"
                onClick={confirmDialog.onConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info / Action Dialog (e.g. AI Auto Scripts) */}
      {infoDialog && (
        <div className="modal-backdrop" onClick={() => setInfoDialog(null)}>
          <div
            className="modal info-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="info-dialog-header">
              <div className="info-dialog-icon-wrap">
                <span style={{ fontSize: 22 }}>🤖</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="info-dialog-title">{infoDialog.title}</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setInfoDialog(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>
            <div className="info-dialog-body">{infoDialog.body}</div>
            <div className="info-dialog-footer">
              <button
                className="modal-btn-secondary"
                onClick={() => setInfoDialog(null)}
              >
                Cancel
              </button>
              <button
                className="modal-btn-primary"
                onClick={infoDialog.onConfirm}
              >
                {infoDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
