"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = "idle" | "running" | "done" | "error";

interface Session {
  id: string;
  status: SessionStatus;
  prompt: string;
  agentType: string;
  repoPath: string;
  prUrl?: string;
  errorMessage?: string;
  command?: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconGitPullRequest() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 012 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconGitCommit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="22.95" y2="12" />
    </svg>
  );
}


function IconInbox() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function IconCornerLeftUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 00-4-4H4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconMoreVertical() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function renderMessageContent(content: string) {
  if (content.startsWith("❌ Error:") || content.startsWith("❌ Internal error:")) {
    const isInternal = content.startsWith("❌ Internal error:");
    const prefix = isInternal ? "❌ Internal error:" : "❌ Error:";
    const errorDetail = content.substring(prefix.length).trim();
    
    return (
      <details className="error-details">
        <summary className="error-summary">
          {prefix} <span className="click-to-expand">(Click to show details)</span>
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
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [agentType, setAgentType] = useState("gemini");
  const [connected, setConnected] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // File browser states
  const [fsModalOpen, setFsModalOpen] = useState(false);
  const [fsCurrentPath, setFsCurrentPath] = useState("/");
  const [fsDirectories, setFsDirectories] = useState<{ name: string; path: string }[]>([]);
  const [fsParentPath, setFsParentPath] = useState<string | null>(null);
  const [fsLoading, setFsLoading] = useState(false);

  // GitHub states
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCheckingGitChanges, setIsCheckingGitChanges] = useState(false);
  const [hasGitChanges, setHasGitChanges] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Console log state
  const [sessionLog, setSessionLog] = useState("");
  const [activeLogMsgId, setActiveLogMsgId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const activeLogMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeLogMsgIdRef.current = activeLogMsgId;
  }, [activeLogMsgId]);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const isRunning = selectedSession?.status === "running";

  // Find the ID of the last command execution system message in the list
  const lastExecMsgId = [...messages]
    .reverse()
    .find((m) => m.role === "system" && m.content.includes("⚙️"))?.id;

  // ── Initial load ──
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        setSessions(data);
        if (data.length > 0) setSelectedSessionId(data[0].id);
      })
      .catch(console.error);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { githubConfigured: boolean }) => {
        setGithubConfigured(data.githubConfigured);
      })
      .catch(console.error);
  }, []);

  // ── Load messages for selected session ──
  useEffect(() => {
    if (!selectedSessionId) { setMessages([]); return; }
    fetch(`/api/messages?sessionId=${selectedSessionId}`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error);
  }, [selectedSessionId]);

  // ── Load execution log for selected session and message ──
  useEffect(() => {
    if (!selectedSessionId || !activeLogMsgId) { setSessionLog(""); return; }
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
    if (!fsModalOpen) return;

    setFsLoading(true);
    fetch(`/api/fs?path=${encodeURIComponent(fsCurrentPath)}`)
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
  }, [fsCurrentPath, fsModalOpen]);

  // ── Close sidebar on resize to desktop ──
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
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
      })
      .catch((err) => {
        console.error("Failed to check git status:", err);
        // Default to true in case of error so the user can still attempt
        setHasGitChanges(true);
      })
      .finally(() => {
        setIsCheckingGitChanges(false);
      });
  }, [menuOpen, selectedSessionId]);

  // ── SSE connection ──
  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; payload: any };

        if (event.type === "session_updated") {
          const updated = event.payload as Session;
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }

        if (event.type === "session_deleted") {
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

        if (event.type === "message_added") {
          const msg = event.payload as Message;
          if (msg.sessionId === selectedSessionId) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }

        if (event.type === "agent_output") {
          const payload = event.payload as { sessionId: string; messageId: string; line: string };
          if (payload.sessionId === selectedSessionId && payload.messageId === activeLogMsgIdRef.current) {
            setSessionLog((prev) => prev + payload.line + "\n");
          }
        }
      } catch { /* ignore */ }
    };

    return () => es.close();
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
        if (!repoPath.trim()) return;
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, repoPath: repoPath.trim(), agentType }),
        });
        const newSession: Session = await res.json();
        setSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.id);
        setIsNewSession(false);
        setSessionLog(""); // Clear log
        setActiveLogMsgId(null);
        setLogModalOpen(false);
      } else {
        const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Failed to send message");
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [prompt, repoPath, agentType, isNewSession, selectedSessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNewSession = () => {
    setSelectedSessionId(null);
    setIsNewSession(true);
    setMessages([]);
    setSidebarOpen(false);
    setSessionLog(""); // Clear log
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
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
          prev.map((s) => (s.id === selectedSessionId ? { ...s, prUrl: data.prUrl } : s))
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
    try {
      const commitPrompt = "Please commit the changes with an appropriate commit message.";
      const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitPrompt }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to commit changes");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while calling the agent to commit changes.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setIsNewSession(false);
    setSidebarOpen(false);
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    setMenuOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Are you sure you want to delete this session?")) return;
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
        alert(data.error || "Failed to delete session");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting the session.");
    }
  };

  const canSubmit = prompt.trim().length > 0 && (isNewSession ? repoPath.trim().length > 0 : !!selectedSessionId) && !isRunning;

  // ── Render ──
  return (
    <div className="app">
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <div className={`status-dot ${connected ? "connected" : ""}`} suppressHydrationWarning />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }} suppressHydrationWarning>
            {connected ? "Live" : "Connecting…"}
          </span>
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
        <div className="sidebar-header">
          <span className="sidebar-title">Sessions</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="new-task-btn" onClick={handleNewSession} id="new-session-btn">
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
        <div className="task-list">
          {sessions.length === 0 && (
            <div className="empty-state">
              <IconInbox />
              <p>No sessions yet.<br />Start by creating a new session.</p>
            </div>
          )}
          {sessions.map((session) => (
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
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
                  {session.agentType}
                </span>
              </div>
              <div className="task-item-prompt">{session.prompt}</div>
              <div className="task-item-time">{formatRelative(session.createdAt)}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Session info bar */}
        {selectedSession && (
          <div className="task-info-bar" style={{ gap: 12, flexWrap: "wrap", padding: "10px 16px", minHeight: "56px" }}>
            <span className={`task-status-badge ${selectedSession.status}`}>
              {selectedSession.status === "running" && "⟳ "}
              {selectedSession.status === "running" ? "Agent working…" : selectedSession.status}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span className="task-info-prompt" style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedSession.prompt}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Repo: {selectedSession.repoPath} ({selectedSession.agentType})
              </span>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
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
                  {/* Show Diff */}
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

                  {/* Commit Changes */}
                  <button
                    className="menu-item"
                    onClick={() => {
                      handleCommitChanges();
                      setMenuOpen(false);
                    }}
                    disabled={isRunning || isCommitting || isCheckingGitChanges || !hasGitChanges}
                    id="menu-commit-changes"
                  >
                    <IconGitCommit /> {isCommitting ? "Committing Changes…" : "Commit Changes"}
                  </button>

                  {/* Create PR / View PR */}
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
                        disabled={!githubConfigured || isCreatingPr}
                        id="menu-create-pr"
                      >
                        <IconGitPullRequest /> {isCreatingPr ? "Creating PR…" : "Create PR"}
                      </button>
                    )
                  )}

                  {/* Delete Session */}
                  <button
                    className="menu-item delete"
                    onClick={() => {
                      handleDeleteSession(selectedSessionId!);
                      setMenuOpen(false);
                    }}
                    disabled={selectedSession.status === "running"}
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
                Delegate coding tasks to AI agents, review GitHub PRs on your phone,
                and ship software from anywhere — no laptop required.
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

          {(selectedSession || isNewSession) && messages.length === 0 && !isRunning && (
            <div className="welcome-screen">
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {isNewSession ? "Describe what you want the agent to do…" : "No messages yet."}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isCommandExec = msg.role === "system" && msg.content.includes("⚙️");
            const isThisMsgRunning = isRunning && isCommandExec && msg.id === lastExecMsgId;

            return (
              <div key={msg.id} style={{ display: "contents" }}>
                <div className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === "user" ? "U" : msg.role === "agent" ? "AI" : "⚙"}
                  </div>
                  <div>
                    <div className="message-bubble">{renderMessageContent(msg.content)}</div>
                    <div className="message-time">{formatTime(msg.createdAt)}</div>
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
                    <IconBolt />
                    <span>Agent Execution Log</span>
                    {isThisMsgRunning && <span className="console-badge-running">⟳ Streaming...</span>}
                  </button>
                )}
              </div>
            );
          })}

          {isRunning && (
            <div className="typing-indicator">
              <div className="message-avatar" style={{
                background: "var(--success-bg)",
                border: "1px solid rgba(34, 211, 165, 0.2)",
                color: "var(--success)",
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, flexShrink: 0
              }}>
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
              <span className="input-label">Repo:</span>
              <div style={{ display: "flex", flex: 1, gap: 6, minWidth: 0 }}>
                <input
                  className="input-field-sm"
                  type="text"
                  placeholder="Click to select repository directory…"
                  value={repoPath}
                  readOnly
                  onClick={() => {
                    const startingPath = repoPath.trim() || "/";
                    setFsCurrentPath(startingPath);
                    setFsModalOpen(true);
                  }}
                  style={{ cursor: "pointer" }}
                  disabled={isRunning}
                  id="repo-path-input"
                />
                <button
                  type="button"
                  className="browse-btn"
                  onClick={() => {
                    const startingPath = repoPath.trim() || "/";
                    setFsCurrentPath(startingPath);
                    setFsModalOpen(true);
                  }}
                  disabled={isRunning}
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
                <option value="gemini">Gemini</option>
                <option value="antigravity">Antigravity (agy)</option>
              </select>
            </div>
          )}
          <div className="input-row">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder={isRunning ? "Agent is working…" : isNewSession ? "Describe what you want the agent to build or fix in this repo…" : "Send a message or follow-up feedback to the agent…"}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              rows={1}
              id="chat-input"
            />
            <button
              className="send-btn"
              onClick={handleSubmit}
              disabled={!canSubmit}
              title="Send (⌘+Enter)"
              id="send-btn"
            >
              <IconSend />
            </button>
          </div>
        </div>
      </main>

      {/* File Explorer Modal */}
      {fsModalOpen && (
        <div className="modal-backdrop" onClick={() => setFsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Select Repository Directory</span>
              <button className="modal-close-btn" onClick={() => setFsModalOpen(false)} aria-label="Close modal">
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              <div className="fs-current-path">
                {fsCurrentPath}
              </div>
              <div className="fs-list">
                {fsParentPath !== null && (
                  <div className="fs-item fs-parent" onClick={() => setFsCurrentPath(fsParentPath)}>
                    <span className="fs-item-icon"><IconCornerLeftUp /></span>
                    <span className="fs-item-name">.. (Go Up)</span>
                  </div>
                )}
                {fsLoading ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    Loading directories…
                  </div>
                ) : fsDirectories.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No directories found.
                  </div>
                ) : (
                  fsDirectories.map((dir) => (
                    <div key={dir.path} className="fs-item" onClick={() => setFsCurrentPath(dir.path)}>
                      <span className="fs-item-icon"><IconFolder /></span>
                      <span className="fs-item-name" title={dir.name}>{dir.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-secondary" onClick={() => setFsModalOpen(false)}>
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
        <div className="modal-backdrop" onClick={() => { setLogModalOpen(false); setActiveLogMsgId(null); }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconBolt />
                Agent Execution Log
              </span>
              <button className="modal-close-btn" onClick={() => { setLogModalOpen(false); setActiveLogMsgId(null); }} aria-label="Close modal">
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              <pre className="console-log-modal">
                {sessionLog}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-secondary" onClick={() => { setLogModalOpen(false); setActiveLogMsgId(null); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
