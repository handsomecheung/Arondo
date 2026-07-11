"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Session, Project, Runner, ProjectScript, Message, TaskItem } from "@/types/home";
import { AGENT_COMMANDS, mergeAgentCommands } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";
import { IconTaskQueue, IconBolt, IconMenu } from "@/components/Icons";
import AppSidebar from "@/components/AppSidebar";
import ProjectPanel from "@/components/ProjectPanel";
import SessionView from "@/components/SessionView";
import FileExplorerModal from "@/components/modals/FileExplorerModal";
import ChatFileSelectorModal from "@/components/modals/ChatFileSelectorModal";
import LogConsoleModal from "@/components/modals/LogConsoleModal";
import ShellTerminalModal from "@/components/modals/ShellTerminalModal";
import FileBrowserModal from "@/components/modals/FileBrowserModal";
import DiffModal from "@/components/modals/DiffModal";
import CommandModal from "@/components/modals/CommandModal";
import AddScriptModal from "@/components/modals/AddScriptModal";
import ToastNotification from "@/components/modals/ToastNotification";
import ApiErrorModal from "@/components/modals/ApiErrorModal";
import ProjectNotReadyModal from "@/components/modals/ProjectNotReadyModal";
import RenameSessionDialog from "@/components/modals/RenameSessionDialog";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import InfoDialog from "@/components/modals/InfoDialog";
import {
  formatTime, formatRelative, formatDuration, readUrlState,
  parseExecCommand, execCardInfoToItem, resolveRepoFilePath,
} from "@/lib/homeUtils";
import type { ExecCardInfo } from "@/lib/homeUtils";
import { useFileSystem } from "@/lib/hooks/useFileSystem";
import { useGitHub } from "@/lib/hooks/useGitHub";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { useScripts } from "@/lib/hooks/useScripts";
import { useInitialLoad } from "@/lib/hooks/useInitialLoad";
import { useSessionSubmit } from "@/lib/hooks/useSessionSubmit";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

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

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [sessions, setSessions] = useState<Session[]>([]);
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [sessions]);
  const initUrl = useMemo(readUrlState, []);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initUrl.session,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [agentType, setAgentType] = useState("auto");
  const [runnerId, setRunnerId] = useState("");
  const [runners, setRunners] = useState<Runner[]>([]);
  const [isNewSession, setIsNewSession] = useState(false);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [draftTrigger, setDraftTrigger] = useState<"manual" | "codebaseReady">("codebaseReady");
  const [autoDraftSessionIds, setAutoDraftSessionIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [archivedView, setArchivedView] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<Session[]>([]);

  // Custom dropdown states & refs
  const [runnerDropdownOpen, setRunnerDropdownOpen] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const runnerSelectRef = useRef<HTMLDivElement>(null);
  const agentSelectRef = useRef<HTMLDivElement>(null);

  // Task Queue states
  const [taskQueue, setTaskQueue] = useState<TaskItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Project states
  const [sidebarMode, setSidebarMode] = useState<"sessions" | "projects">(
    initUrl.project ? "projects" : "sessions",
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initUrl.project,
  );

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

  const [agentCommands, setAgentCommands] = useState<AgentCommand[]>(AGENT_COMMANDS);

  const [menuOpen, setMenuOpen] = useState(false);
  const [scriptSubMenuOpen, setScriptSubMenuOpen] = useState(false);

  const [sessionLog, setSessionLog] = useState("");
  const [activeLogMsgId, setActiveLogMsgId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [commandModalText, setCommandModalText] = useState<string | null>(null);
  const [promptModalText, setPromptModalText] = useState<string | null>(null);
  const [shellModalOpen, setShellModalOpen] = useState(false);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [fileBrowserTargetPath, setFileBrowserTargetPath] = useState<string | undefined>(undefined);
  const [diffModalOpen, setDiffModalOpen] = useState(false);

  const activeLogMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeLogMsgIdRef.current = activeLogMsgId;
  }, [activeLogMsgId]);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [viewportStyles, setViewportStyles] = useState<React.CSSProperties>({});

  const {
    fsModalOpen, setFsModalOpen,
    fsCurrentPath, setFsCurrentPath,
    fsDirectories, fsParentPath, fsLoading,
  } = useFileSystem(runnerId);

  const {
    fsModalOpen: chatFsModalOpen, setFsModalOpen: setChatFsModalOpen,
    fsCurrentPath: chatFsCurrentPath, setFsCurrentPath: setChatFsCurrentPath,
    fsEntries: chatFsEntries, fsParentPath: chatFsParentPath, fsLoading: chatFsLoading,
  } = useFileSystem(runnerId);

  const { isCheckingGitChanges, hasGitChanges, isGitRepo } = useGitHub({
    selectedSessionId,
    menuOpen,
  });

  const { connected, wsInstance } = useWebSocket({
    selectedSessionId,
    setSessions,
    setMessages,
    setTaskQueue,
    setSelectedSessionId,
    setSessionLog,
    setActiveLogMsgId,
    setLogModalOpen,
  });

  const selectedSession =
    sessions.find((s) => s.id === selectedSessionId) ??
    archivedSessions.find((s) => s.id === selectedSessionId) ??
    null;
  const isArchivedSession = !sessions.some((s) => s.id === selectedSessionId)
    && archivedSessions.some((s) => s.id === selectedSessionId);
  const isRunning =
    selectedSession?.status === "running" ||
    selectedSession?.status === "script-running";
  const isAgentRunning = taskQueue.some(
    (t) => t.sessionId === selectedSessionId && t.type === "agent",
  );

  const selectedRunner = runners.find((r) => r.id === runnerId) ?? null;
  const runnerAgents = selectedRunner?.agents;
  const isAgentAvailable = (agentCmd: string): boolean => {
    if (!runnerAgents) return true;
    return runnerAgents.includes(agentCmd);
  };

  const {
    projectScripts, setProjectScripts,
    draggedIndex,
    scriptModalOpen, setScriptModalOpen,
    scriptName, setScriptName,
    scriptCommand, setScriptCommand,
    editingScriptName, setEditingScriptName,
    sessionScripts,
    isRunningScript,
    loadProjectScripts,
    handleSaveScript,
    handleDeleteScript,
    handleCloseScriptModal,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleAutoAddScripts,
    handleRunScript,
    handleRunGlobalScript,
  } = useScripts({
    selectedProjectId,
    selectedSessionId,
    selectedSessionProjectId: selectedSession?.projectId,
    setApiError,
    setConfirmDialog,
    setInfoDialog,
    setToast,
    setTaskQueue,
    setMenuOpen,
    setScriptSubMenuOpen,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (vv) {
        if (window.innerWidth < 768) {
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

  const lastPushedUrlRef = useRef(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  useEffect(() => {
    let url = "/";
    if (selectedProjectId) url = `/project/${selectedProjectId}`;
    else if (selectedSessionId) url = `/session/${selectedSessionId}`;
    if (url !== lastPushedUrlRef.current) {
      window.history.pushState(null, "", url);
      lastPushedUrlRef.current = url;
    }
  }, [selectedSessionId, selectedProjectId]);

  useEffect(() => {
    const onPopState = () => {
      lastPushedUrlRef.current = window.location.pathname;
      const { session, project } = readUrlState();
      if (project) {
        setSidebarMode("projects");
        setSelectedProjectId(project);
      } else {
        setSidebarMode("sessions");
        setSelectedProjectId(null);
        setSelectedSessionId(session);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        runnerSelectRef.current &&
        !runnerSelectRef.current.contains(event.target as Node)
      ) {
        setRunnerDropdownOpen(false);
      }
      if (
        agentSelectRef.current &&
        !agentSelectRef.current.contains(event.target as Node)
      ) {
        setAgentDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const { execCards, returnMsgIds } = useMemo(() => {
    const cards = new Map<string, ExecCardInfo>();
    const retIds = new Set<string>();
    const unmatchedAgent: string[] = [];
    const unmatchedScript: string[] = [];
    let lastUserPrompt = "";

    const validMessages = Array.isArray(messages) ? messages : [];
    for (const msg of validMessages) {
      if (msg.role === "user" && msg.type === "chat-user") {
        lastUserPrompt = msg.content;
      }

      if (
        msg.role === "system" &&
        (msg.type === "agent-run" || msg.type === "script-run")
      ) {
        const parsed = parseExecCommand(msg.content);
        cards.set(msg.id, {
          runMsg: msg,
          returnMsg: null,
          isScript: msg.type === "script-run",
          commandLabel: parsed.label,
          command: parsed.command,
          agentType: msg.resolvedAgentType,
          prompt: msg.prompt || lastUserPrompt || undefined,
          isQuickCard: msg.type === "script-run" && !!msg.prompt && msg.prompt.startsWith("!"),
        });
        if (msg.type === "script-run") {
          unmatchedScript.push(msg.id);
        } else {
          unmatchedAgent.push(msg.id);
        }
        continue;
      }

      if (msg.type === "agent-return" || msg.type === "script-return") {
        let card: ExecCardInfo | undefined;

        if (msg.parentId && cards.has(msg.parentId)) {
          card = cards.get(msg.parentId)!;
          const queue = card.isScript ? unmatchedScript : unmatchedAgent;
          const idx = queue.indexOf(msg.parentId);
          if (idx !== -1) queue.splice(idx, 1);
        } else {
          const queue =
            msg.type === "agent-return" ? unmatchedAgent : unmatchedScript;
          if (queue.length > 0) {
            card = cards.get(queue.shift()!)!;
          }
        }

        if (card && !card.returnMsg) {
          card.returnMsg = msg;
          retIds.add(msg.id);
        }
      }
    }

    return { execCards: cards, returnMsgIds: retIds };
  }, [messages]);

  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => {
        if (!Array.isArray(data)) return;
        setRunners(data);
        if (data.length > 0 && !runnerId) {
          const onlineRunner = data.find((r) => r.connected);
          if (onlineRunner) {
            setRunnerId(onlineRunner.id);
          } else {
            setRunnerId(data[0].id);
          }
        }
      })
      .catch(console.error);
  }, [runnerId]);

  const loadProjects = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(console.error);
  }, []);

  const loadArchivedSessions = useCallback(() => {
    fetch("/api/sessions/archived")
      .then((r) => r.json())
      .then((data: Session[]) => {
        if (Array.isArray(data)) setArchivedSessions(data);
      })
      .catch(console.error);
  }, []);

  const handleOpenArchivedSessions = () => {
    setArchivedView(true);
    setSelectedProjectId(null);
    loadArchivedSessions();
  };

  const handleCloseArchivedSessions = () => {
    setArchivedView(false);
  };

  const handleSelectArchivedSession = (id: string) => {
    setSelectedSessionId(id);
    setSelectedProjectId(null);
    setIsNewSession(false);
    setIsNewDraft(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleArchiveSession = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/archive`, { method: "POST" });
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
        setApiError({ title: "Archive Session Error", message: data.error || "Failed to archive session" });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({ title: "Archive Session Error", message: err.message || "Failed to archive session" });
    }
  };

  const handleUnarchiveSession = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/unarchive`, { method: "POST" });
      if (res.ok) {
        const updated: Session = await res.json();
        setArchivedSessions((prev) => prev.filter((s) => s.id !== id));
        setSessions((prev) => [...prev.filter((s) => s.id !== id), updated]);
        setArchivedView(false);
        setSidebarMode("sessions");
      } else {
        const data = await res.json();
        setApiError({ title: "Unarchive Session Error", message: data.error || "Failed to unarchive session" });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({ title: "Unarchive Session Error", message: err.message || "Failed to unarchive session" });
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useInitialLoad({
    initUrl,
    setSessions,
    setSelectedSessionId,
    setTaskQueue,
    setAgentCommands,
    loadProjects,
    loadRunners,
  });

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }
    fetch(`/api/messages?sessionId=${selectedSessionId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Message[]) => setMessages(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setMessages([]);
      });
  }, [selectedSessionId]);

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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRunning]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
            setArchivedSessions((prev) => prev.filter((s) => s.id !== id));
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

  const handleSelectChatFsItem = (absolutePath: string) => {
    const root = selectedSession?.repoPath || "";
    let relativePath = absolutePath;
    if (root) {
      if (absolutePath === root) {
        relativePath = ".";
      } else if (absolutePath.startsWith(root)) {
        relativePath = absolutePath.substring(root.length);
        if (relativePath.startsWith("/")) {
          relativePath = relativePath.substring(1);
        }
      }
    }

    const el = textareaRef.current;
    if (el) {
      const selectionStart = el.selectionStart;
      const value = prompt;
      let newValue = value;
      let newCursorPos = selectionStart;

      if (selectionStart > 0 && value[selectionStart - 1] === "@") {
        newValue = value.substring(0, selectionStart) + relativePath + value.substring(selectionStart);
        newCursorPos = selectionStart + relativePath.length;
      } else {
        newValue = value.substring(0, selectionStart) + "@" + relativePath + value.substring(selectionStart);
        newCursorPos = selectionStart + 1 + relativePath.length;
      }

      setPrompt(newValue);

      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = newCursorPos;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
      });
    } else {
      if (prompt.endsWith("@")) {
        setPrompt(prompt + relativePath);
      } else {
        setPrompt(prompt + "@" + relativePath);
      }
    }
    setChatFsModalOpen(false);
  };

  const { handlePromptChange, handleNewSessionCommand, handleAgentCommand, handleScriptCommand, handleSubmit, handleKeyDown, commandMenuIndex, pendingConfirmation, resolvePendingConfirmation, cancelPendingConfirmation } = useSessionSubmit({
    prompt,
    repoPath,
    agentType,
    runnerId,
    isNewSession,
    isNewDraft,
    draftTrigger,
    showCommandMenu,
    selectedSession,
    selectedSessionId,
    textareaRef,
    setPrompt,
    setShowCommandMenu,
    setSessions,
    setSelectedSessionId,
    setIsNewSession,
    setIsNewDraft,
    setMessages,
    setSessionLog,
    setActiveLogMsgId,
    setLogModalOpen,
    setTaskQueue,
    setApiError,
    setToast,
    loadProjects,
    agentCommands,
    sessionScripts,
    onRunScript: handleRunScript,
    onDeleteSession: handleDeleteSession,
    onTriggerFsModal: () => {
      if (selectedSession?.repoPath) {
        setChatFsCurrentPath(selectedSession.repoPath);
      }
      setChatFsModalOpen(true);
    },
  });

  const handleNewSession = () => {
    setSelectedSessionId(null);
    setSelectedProjectId(null);
    setIsNewSession(true);
    setIsNewDraft(false);
    setMessages([]);
    setSidebarOpen(false);
    setSessionLog("");
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleNewDraft = () => {
    setSelectedSessionId(null);
    setSelectedProjectId(null);
    setIsNewDraft(true);
    setIsNewSession(false);
    setDraftTrigger("codebaseReady");
    setMessages([]);
    setSidebarOpen(false);
    setSessionLog("");
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleSendDraftNow = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/send-draft-now`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Send Draft Error", message: data.error || "Failed to send draft" });
        return;
      }
      const updated: Session = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err: any) {
      console.error(err);
      setApiError({ title: "Send Draft Error", message: err.message || "Failed to send draft" });
    }
  };

  // Draft sessions with a pending codebaseReady scheduled task will send
  // automatically ("Pending"); the rest are manual-only ("Draft").
  const loadAutoDraftSessionIds = useCallback(() => {
    fetch("/api/scheduled-tasks")
      .then((r) => r.json())
      .then((tasks: any[]) => {
        const ids = new Set<string>(
          tasks
            .filter((t) => t.status === "pending" && t.trigger?.kind === "codebaseReady")
            .map((t) => t.action.sessionId as string),
        );
        setAutoDraftSessionIds(ids);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadAutoDraftSessionIds();
    const interval = setInterval(loadAutoDraftSessionIds, 15000);
    return () => clearInterval(interval);
  }, [loadAutoDraftSessionIds, sessions.length]);

  const handleToggleDraftTrigger = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/draft-trigger`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Toggle Draft Send Error", message: data.error || "Failed to switch send mode" });
        return;
      }
      loadAutoDraftSessionIds();
    } catch (err: any) {
      console.error(err);
      setApiError({ title: "Toggle Draft Send Error", message: err.message || "Failed to switch send mode" });
    }
  };

  const handleStopExecCard = async (msgId: string) => {
    if (!selectedSessionId) return;
    try {
      // Optimistic update: instantly add a stopped message to the state to refresh ExecCard
      const isScript = execCards.get(msgId)?.isScript ?? false;
      const optimisticReturnMsg: Message = {
        id: `optimistic-stopped-${msgId}`,
        sessionId: selectedSessionId,
        role: "system",
        content: "🛑 Stopped by user",
        type: isScript ? "script-return" : "agent-return",
        parentId: msgId,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => {
        if (prev.some((m) => m.parentId === msgId && (m.type === "agent-return" || m.type === "script-return"))) {
          return prev;
        }
        return [...prev, optimisticReturnMsg];
      });

      await fetch("/api/tasks/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId, messageId: msgId }),
      });
    } catch (err) {
      console.error("Failed to stop task:", err);
    }
  };

  const handleRestartScriptCard = async (msgId: string, scriptName: string) => {
    if (!selectedSessionId) return;
    try {
      await fetch(`/api/sessions/${selectedSessionId}/restart-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName, messageId: msgId }),
      });
      // Runner restarts in-place — no state update needed.
    } catch (err) {
      console.error("Failed to restart script:", err);
    }
  };

  const handleSwitchAgent = async (newAgentType: string) => {
    if (!selectedSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType: newAgentType }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions((prev) => prev.map((s) => (s.id === selectedSessionId ? updated : s)));
      }
    } catch (err) {
      console.error("Failed to switch agent:", err);
    }
  };

  const handleRetryCard = async (cardInfo: ExecCardInfo) => {
    if (!selectedSessionId) return;
    if (cardInfo.isScript) {
      handleRunScript(cardInfo.commandLabel);
    } else {
      try {
        await fetch(`/api/sessions/${selectedSessionId}/rerun-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Failed to retry agent:", err);
      }
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSessionId(null);
    setIsNewSession(false);
    setIsNewDraft(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setSelectedProjectId(null);
    setIsNewSession(false);
    setIsNewDraft(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
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
        setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
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

  const selectedRunnerConnected = useMemo(() => {
    const activeId = selectedSession ? selectedSession.runnerId : runnerId;
    const r = runners.find((r) => r.id === activeId);
    return r ? r.connected : false;
  }, [runners, runnerId, selectedSession]);

  const isDraftSession = selectedSession?.status === "draft";

  const canSubmit =
    selectedRunnerConnected &&
    !isArchivedSession &&
    (isNewDraft
      ? repoPath.trim().length > 0 && !!runnerId && prompt.trim().length > 0
      : isNewSession
        ? repoPath.trim().length > 0 && !!runnerId
        : isDraftSession
          ? true
          : prompt.trim().length > 0 && !!selectedSessionId);

  const getSendTooltip = () => {
    if (!selectedRunnerConnected) {
      return "Runner is offline";
    }
    if (isArchivedSession) {
      return "Session is archived. Unarchive it to send messages.";
    }
    if (isNewDraft) {
      if (!runnerId) {
        return "Please select a runner first";
      }
      if (repoPath.trim().length === 0) {
        return "Please select a project path";
      }
      if (!prompt.trim()) {
        return "Describe what you want to do";
      }
      return "Save Draft (Enter)";
    }
    if (isNewSession) {
      if (!runnerId) {
        return "Please select a runner first";
      }
      if (repoPath.trim().length === 0) {
        return "Please select a project path";
      }
      if (!prompt.trim()) {
        return "Create Blank Session";
      }
      return "Send (Enter)";
    } else if (isDraftSession) {
      return "Send this draft now";
    } else {
      if (!selectedSessionId) {
        return "No active session selected";
      }
      if (prompt.trim().length === 0) {
        return "Please enter a message";
      }
      if (isAgentRunning) {
        return "Agent is working — message will be sent once it finishes";
      }
      return "Send (Enter)";
    }
  };

  const activeLogMsg = messages.find((m) => m.id === activeLogMsgId);
  const isScriptLog = activeLogMsg?.type === "script-run";

  if (!mounted) {
    return null;
  }

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
          <span className="header-title">Arondo</span>
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
          <div className="task-queue-wrapper">
            <Link
              href="/tasks"
              className="task-queue-btn"
              title="Task Queue"
              aria-label="View running tasks"
            >
              <IconTaskQueue />
              {taskQueue.length > 0 && (
                <span className="task-queue-badge">{taskQueue.length}</span>
              )}
            </Link>
          </div>

          <div
            className={`status-dot ${connected ? "connected" : ""}`}
            suppressHydrationWarning
            title={connected ? "Live" : "Connecting…"}
          />
        </div>
      </header>

      <AppSidebar
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        sidebarMode={sidebarMode}
        onSetSidebarMode={setSidebarMode}
        sortedSessions={sortedSessions}
        projects={projects}
        runners={runners}
        selectedSessionId={selectedSessionId}
        selectedProjectId={selectedProjectId}
        autoDraftSessionIds={autoDraftSessionIds}
        onSelectSession={handleSelectSession}
        onSelectProject={handleSelectProject}
        onNewSession={handleNewSession}
        onNewDraft={handleNewDraft}
        archivedView={archivedView}
        archivedSessions={archivedSessions}
        onOpenArchivedSessions={handleOpenArchivedSessions}
        onCloseArchivedSessions={handleCloseArchivedSessions}
        onSelectArchivedSession={handleSelectArchivedSession}
      />

      {/* Main */}
      <main className="main">
        {selectedProjectId ? (
          (() => {
            const project = projects.find((p) => p.id === selectedProjectId);
            if (!project) return null;
            const projectSessions = sortedSessions.filter(
              (s) => s.projectId === project.id,
            );
            return (
              <ProjectPanel
                project={project}
                projectSessions={projectSessions}
                projectScripts={projectScripts}
                draggedIndex={draggedIndex}
                runners={runners}
                isAutoAnalyzing={taskQueue.some((t) => (t.name === "Agent: Auto Scripts Analysis" || t.scriptName === "Auto Scripts Analysis") && t.status === "running" && t.projectId === project.id)}
                onRunScript={handleRunGlobalScript}
                onNewSession={() => {
                  setRepoPath(project.repoPath);
                  setRunnerId(project.runnerId);
                  handleNewSession();
                  setSidebarMode("sessions");
                }}
                onDeleteProject={() => {
                  const folderName = project.repoPath.split("/").pop() || project.repoPath;
                  setConfirmDialog({
                    message: `Are you sure you want to delete project "${folderName}"?`,
                    onConfirm: async () => {
                      setConfirmDialog(null);
                      try {
                        const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
                        if (res.ok) {
                          setSelectedProjectId(null);
                          loadProjects();
                        } else {
                          const err = await res.json();
                          setApiError({ title: "Delete Project Error", message: err.error || "Failed to delete project" });
                        }
                      } catch (e: any) {
                        setApiError({ title: "Delete Project Error", message: e.message || "Failed to delete project" });
                      }
                    },
                  });
                }}
                onOpenScriptModal={(name, command) => {
                  if (name) {
                    setScriptName(name);
                    setScriptCommand(command!);
                    setEditingScriptName(name);
                  }
                  setScriptModalOpen(true);
                }}
                onAddScriptModal={() => setScriptModalOpen(true)}
                onDeleteScript={handleDeleteScript}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onAutoAddScripts={handleAutoAddScripts}
                onSelectSession={handleSelectSession}
              />
            );
          })()
        ) : (
          <SessionView
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            isNewSession={isNewSession}
            isNewDraft={isNewDraft}
            messages={messages}
            execCards={execCards}
            returnMsgIds={returnMsgIds}
            runners={runners}
            projects={projects}
            runnerAgents={runnerAgents}
            runnerId={runnerId}
            agentType={agentType}
            repoPath={repoPath}
            prompt={prompt}
            isAgentRunning={isAgentRunning}
            isRunning={isRunning}
            isArchived={isArchivedSession}
            onUnarchiveSession={() => selectedSessionId && handleUnarchiveSession(selectedSessionId)}
            isDraftSession={isDraftSession}
            isDraftAutoSend={!!selectedSessionId && autoDraftSessionIds.has(selectedSessionId)}
            draftTrigger={draftTrigger}
            canSubmit={canSubmit}
            menuOpen={menuOpen}
            scriptSubMenuOpen={scriptSubMenuOpen}
            showCommandMenu={showCommandMenu}
            commandMenuIndex={commandMenuIndex}
            sessionScripts={sessionScripts}
            isCheckingGitChanges={isCheckingGitChanges}
            hasGitChanges={hasGitChanges}
            isGitRepo={isGitRepo}
            runnerDropdownOpen={runnerDropdownOpen}
            agentDropdownOpen={agentDropdownOpen}
            menuRef={menuRef}
            runnerSelectRef={runnerSelectRef}
            agentSelectRef={agentSelectRef}
            chatBottomRef={chatBottomRef}
            textareaRef={textareaRef}
            renderMessageContent={renderMessageContent}
            getSendTooltip={getSendTooltip}
            isAgentAvailable={isAgentAvailable}
            onSetMenuOpen={setMenuOpen}
            onSetScriptSubMenuOpen={setScriptSubMenuOpen}
            onSetRunnerId={setRunnerId}
            onSetRepoPath={setRepoPath}
            onSetAgentType={setAgentType}
            onSetDraftTrigger={setDraftTrigger}
            onSetRunnerDropdownOpen={setRunnerDropdownOpen}
            onSetAgentDropdownOpen={setAgentDropdownOpen}
            onSetFsCurrentPath={setFsCurrentPath}
            onSetFsModalOpen={setFsModalOpen}
            ws={wsInstance}
            onViewLog={(msgId) => { setActiveLogMsgId(msgId); setLogModalOpen(true); }}
            onShowCommand={(cmd) => setCommandModalText(cmd)}
            onShowPrompt={(prompt) => setPromptModalText(prompt)}
            onStopExecCard={handleStopExecCard}
            onRestartScriptCard={handleRestartScriptCard}
            onRetryCard={handleRetryCard}
            onSubmit={handleSubmit}
            onArchiveSession={handleArchiveSession}
            onSendDraftNow={handleSendDraftNow}
            onToggleDraftTrigger={handleToggleDraftTrigger}
            onPromptChange={handlePromptChange}
            onKeyDown={handleKeyDown}
            onRunScript={handleRunScript}
            onDeleteSession={handleDeleteSession}
            onOpenShellModal={() => setShellModalOpen(true)}
            onOpenFileBrowser={() => setFileBrowserOpen(true)}
            onShowDiff={() => setDiffModalOpen(true)}
            onOpenFilePath={(path) => {
              const base = selectedSession?.repoPath ?? repoPath;
              const decoded = decodeURIComponent(path);
              setFileBrowserTargetPath(resolveRepoFilePath(base, decoded));
              setFileBrowserOpen(true);
            }}
            onOpenRenameModal={() => {
              if (selectedSession && selectedSessionId) {
                setRenameModal({ sessionId: selectedSessionId, currentName: selectedSession.name || selectedSession.prompt });
                setRenameInput(selectedSession.name || selectedSession.prompt);
              }
            }}
            onManageScripts={() => {
              setMenuOpen(false);
              setScriptSubMenuOpen(false);
              if (selectedSession?.projectId) {
                handleSelectProject(selectedSession.projectId);
              }
            }}
            onGoToProject={() => {
              if (selectedSession?.projectId) handleSelectProject(selectedSession.projectId);
            }}
            agentCommands={agentCommands}
            onNewSession={handleNewSession}
            onNewSessionCommand={handleNewSessionCommand}
            onExecuteAgentCommand={handleAgentCommand}
            onExecuteScriptCommand={handleScriptCommand}
            onSwitchAgent={handleSwitchAgent}
          />
        )}
      </main>

      <ChatFileSelectorModal
        open={chatFsModalOpen}
        onClose={() => setChatFsModalOpen(false)}
        currentPath={chatFsCurrentPath}
        onChangePath={setChatFsCurrentPath}
        parentPath={chatFsParentPath}
        entries={chatFsEntries}
        loading={chatFsLoading}
        projectRoot={selectedSession?.repoPath || "/"}
        onSelect={handleSelectChatFsItem}
      />

      <FileExplorerModal
        open={fsModalOpen}
        onClose={() => setFsModalOpen(false)}
        currentPath={fsCurrentPath}
        onChangePath={setFsCurrentPath}
        parentPath={fsParentPath}
        directories={fsDirectories}
        loading={fsLoading}
        onSelect={() => {
          setRepoPath(fsCurrentPath);
          setFsModalOpen(false);
        }}
      />

      <LogConsoleModal
        open={logModalOpen}
        onClose={() => {
          setLogModalOpen(false);
          setActiveLogMsgId(null);
        }}
        activeLogMsgId={activeLogMsgId}
        isRunning={!!(activeLogMsgId && execCards.get(activeLogMsgId)?.returnMsg === null)}
        isScriptLog={isScriptLog}
        selectedSessionId={selectedSessionId}
        ws={wsInstance}
      />

      <ShellTerminalModal
        key={selectedSessionId ?? ""}
        open={shellModalOpen}
        onClose={() => setShellModalOpen(false)}
        repoPath={selectedSession?.repoPath}
        runnerId={selectedSession?.runnerId}
        sessionId={selectedSessionId}
        ws={wsInstance}
      />

      <FileBrowserModal
        open={fileBrowserOpen}
        onClose={() => { setFileBrowserOpen(false); setFileBrowserTargetPath(undefined); }}
        runnerId={selectedSession?.runnerId ?? runnerId}
        initialPath={selectedSession?.repoPath ?? "/"}
        initialFilePath={fileBrowserTargetPath}
      />

      <DiffModal
        open={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        sessionId={selectedSessionId || ""}
      />

      <CommandModal
        text={commandModalText}
        onClose={() => setCommandModalText(null)}
      />

      <CommandModal
        text={promptModalText}
        title="Prompt"
        onClose={() => setPromptModalText(null)}
      />

      <AddScriptModal
        open={scriptModalOpen}
        onClose={handleCloseScriptModal}
        editingScriptName={editingScriptName}
        scriptName={scriptName}
        onScriptNameChange={setScriptName}
        scriptCommand={scriptCommand}
        onScriptCommandChange={setScriptCommand}
        onSave={handleSaveScript}
      />

      <ToastNotification
        toast={toast}
        onClose={() => setToast(null)}
      />

      <ApiErrorModal
        apiError={apiError}
        onClose={() => setApiError(null)}
      />

      <ProjectNotReadyModal
        pendingConfirmation={pendingConfirmation}
        onResolve={resolvePendingConfirmation}
        onCancel={cancelPendingConfirmation}
      />

      <RenameSessionDialog
        renameModal={renameModal}
        onClose={() => setRenameModal(null)}
        renameInput={renameInput}
        onRenameInputChange={setRenameInput}
        onSave={handleRenameSession}
      />

      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />

      <InfoDialog
        infoDialog={infoDialog}
        onClose={() => setInfoDialog(null)}
      />
    </div>
  );
}
