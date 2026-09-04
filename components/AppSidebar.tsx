import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconPlus, IconInbox, IconSettings, IconServer, IconMoreVertical, IconArchive, IconArrowLeft, IconTrash, IconPin, IconEdit, IconLogout } from "@/components/Icons";
import { formatRelative, isUnviewedCompletion } from "@/lib/homeUtils";
import type { Session, Project, Runner } from "@/types/home";

const SWIPE_THRESHOLD = 72;

interface Props {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  sortedSessions: Session[];
  projects: Project[];
  runners: Runner[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string) => void;
  onTogglePinSession: (id: string, pinned: boolean) => void;
  onOpenRenameModal: (id: string, currentName: string) => void;
  archivedView: boolean;
  archivedSessions: Session[];
  hasArchived: boolean;
  onOpenArchivedSessions: () => void;
  onCloseArchivedSessions: () => void;
  onSelectArchivedSession: (id: string) => void;
  onLogout?: () => void;
}

export default function AppSidebar({
  sidebarOpen,
  onCloseSidebar,
  sortedSessions,
  projects,
  runners,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onArchiveSession,
  onTogglePinSession,
  onOpenRenameModal,
  archivedView,
  archivedSessions,
  hasArchived,
  onOpenArchivedSessions,
  onCloseArchivedSessions,
  onSelectArchivedSession,
  onLogout,
}: Props) {
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [swipe, setSwipe] = useState<{ id: string; startX: number; dx: number } | null>(null);
  const lastDragDistanceRef = useRef(0);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [sessionMenuPos, setSessionMenuPos] = useState<{ top: number; left: number } | null>(null);
  const sessionMenuTriggerRef = useRef<HTMLDivElement>(null);
  const sessionMenuPortalRef = useRef<HTMLDivElement>(null);
  const [selectedRunnerFilter, setSelectedRunnerFilter] = useState<string | null>(null);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);

  const handleSwipeTouchStart = (id: string) => (e: React.TouchEvent) => {
    setSwipe({ id, startX: e.touches[0].clientX, dx: 0 });
  };
  const handleSwipeTouchMove = (e: React.TouchEvent) => {
    setSwipe((prev) => (prev ? { ...prev, dx: Math.max(0, e.touches[0].clientX - prev.startX) } : prev));
  };
  const handleSwipeTouchEnd = () => {
    const prev = swipe;
    setSwipe(null);
    if (!prev) return;
    lastDragDistanceRef.current = Math.abs(prev.dx);
    if (prev.dx >= SWIPE_THRESHOLD) {
      onDeleteSession(prev.id);
    }
  };
  const handleSwipeClick = (onClick: () => void) => () => {
    if (lastDragDistanceRef.current > 10) {
      lastDragDistanceRef.current = 0;
      return;
    }
    onClick();
  };

  useEffect(() => {
    fetch("/api/auth/verify")
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) setUserRole(data.role);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = sessionMenuTriggerRef.current?.contains(target);
      const insidePortal = sessionMenuPortalRef.current?.contains(target);
      if (!insideTrigger && !insidePortal) {
        setOpenSessionMenuId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!openSessionMenuId) return;
    const close = () => setOpenSessionMenuId(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openSessionMenuId]);

  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`}
        onClick={onCloseSidebar}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header" style={{ flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div ref={moreMenuRef} style={{ position: "relative" }}>
              <button
                className="menu-trigger-btn"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                id="sidebar-more-menu-btn"
                title="More"
              >
                <IconMoreVertical />
              </button>

              {moreMenuOpen && (
                <div className="session-dropdown-menu" style={{ left: 0, right: "auto" }}>
                  <Link
                    href="/runners"
                    className="menu-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onCloseSidebar();
                    }}
                    id="menu-runners"
                  >
                    <IconServer /> Runners
                  </Link>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenArchivedSessions();
                    }}
                    id="menu-archived-sessions"
                  >
                    <IconArchive /> Archived Sessions
                  </button>
                  <Link
                    href="/settings"
                    className="menu-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onCloseSidebar();
                    }}
                    id="menu-settings"
                  >
                    <IconSettings /> Settings
                  </Link>
                  {userRole === "admin" && (
                    <Link
                      href="/admin/settings"
                      className="menu-item"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onCloseSidebar();
                      }}
                      id="menu-admin-settings"
                    >
                      <IconSettings /> Admin Settings
                    </Link>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="new-task-btn" onClick={onNewSession} id="new-session-btn">
                <IconPlus /> Session
              </button>
            </div>
          </div>
          {archivedView && (
            <button
              className="sidebar-settings-link"
              onClick={() => {
                setSelectedProjectFilter(null);
                setSelectedRunnerFilter(null);
                onCloseArchivedSessions();
              }}
              id="close-archived-sessions-btn"
              style={{ width: "100%", color: "var(--text-muted)" }}
            >
              <IconArrowLeft />
              <span>Archived Sessions</span>
            </button>
          )}
          {(() => {
            const targetSessions = archivedView ? archivedSessions : sortedSessions;
            const sessionRunnerIds = new Set(targetSessions.map((s) => s.runnerId).filter(Boolean) as string[]);
            const runnersMap = new Map(runners.map((r) => [r.id, r]));
            const availableRunners = Array.from(sessionRunnerIds).map((rId) => {
              const r = runnersMap.get(rId);
              return { id: rId, name: r ? r.name || r.hostname || rId : rId };
            });

            const runnerFilteredSessions = selectedRunnerFilter
              ? targetSessions.filter((s) => s.runnerId === selectedRunnerFilter)
              : targetSessions;
            const sessionProjectIds = new Set(runnerFilteredSessions.map((s) => s.projectId).filter(Boolean) as string[]);

            const knownProjectsMap = new Map<string, { id: string; name: string }>();
            projects.forEach((p) => {
              if (!selectedRunnerFilter || p.runnerId === selectedRunnerFilter || sessionProjectIds.has(p.id)) {
                const name = p.repoPath.split("/").pop() || p.repoPath;
                knownProjectsMap.set(p.id, { id: p.id, name });
              }
            });
            sessionProjectIds.forEach((pId) => {
              if (!knownProjectsMap.has(pId)) {
                knownProjectsMap.set(pId, { id: pId, name: pId });
              }
            });
            const availableProjects = Array.from(knownProjectsMap.values());

            return (
              <div className="sidebar-filter-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <select
                    className={`sidebar-filter-select ${selectedRunnerFilter ? "active-filter" : ""}`}
                    value={selectedRunnerFilter || ""}
                    onChange={(e) => {
                      const nextRunner = e.target.value || null;
                      setSelectedRunnerFilter(nextRunner);
                      if (nextRunner && selectedProjectFilter) {
                        const proj = projects.find((p) => p.id === selectedProjectFilter);
                        if (proj && proj.runnerId && proj.runnerId !== nextRunner) {
                          setSelectedProjectFilter(null);
                        }
                      }
                    }}
                    aria-label="Filter by runner"
                    id="sidebar-runner-filter"
                    title="Filter by runner"
                  >
                    <option value="">All Runners</option>
                    {availableRunners.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <select
                    className={`sidebar-filter-select ${selectedProjectFilter ? "active-filter" : ""}`}
                    value={selectedProjectFilter || ""}
                    onChange={(e) => setSelectedProjectFilter(e.target.value || null)}
                    aria-label="Filter by project"
                    id="sidebar-project-filter"
                    title="Filter by project"
                  >
                    <option value="">All Projects</option>
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="task-list">
          {archivedView ? (
            archivedSessions.length === 0 ? (
              <div className="empty-state">
                <IconArchive size={32} />
                <p>No archived sessions.</p>
              </div>
            ) : (() => {
              const filtered = archivedSessions.filter(
                (s) =>
                  (!selectedRunnerFilter || s.runnerId === selectedRunnerFilter) &&
                  (!selectedProjectFilter || s.projectId === selectedProjectFilter)
              );
              if (filtered.length === 0) {
                return (
                  <div className="empty-state" style={{ padding: "24px 16px" }}>
                    <p>No matching archived sessions.</p>
                  </div>
                );
              }
              return filtered.map((session) => {
                const project = projects.find((p) => p.id === session.projectId);
                const projectName = project ? project.repoPath.split("/").pop() || project.repoPath : "";
                const isSwiping = swipe?.id === session.id;
                const swipeDx = isSwiping ? swipe!.dx : 0;
                const clampedDx = Math.max(0, Math.min(120, swipeDx));
                return (
                  <div
                    key={`archived-session-${session.id}`}
                    className="task-item-swipe-wrapper"
                  >
                    <div className="task-item-swipe-action task-item-swipe-action-delete" style={{ opacity: clampedDx > 8 ? Math.min(1, clampedDx / SWIPE_THRESHOLD) : 0 }}>
                      <IconTrash /> Delete
                    </div>
                    <div
                      className={`task-item ${selectedSessionId === session.id ? "active" : ""}`}
                      onClick={handleSwipeClick(() => onSelectArchivedSession(session.id))}
                      onTouchStart={handleSwipeTouchStart(session.id)}
                      onTouchMove={handleSwipeTouchMove}
                      onTouchEnd={handleSwipeTouchEnd}
                      onTouchCancel={handleSwipeTouchEnd}
                      style={{
                        transform: `translateX(${clampedDx}px)`,
                        transition: isSwiping ? "none" : "transform 0.2s ease",
                      }}
                      id={`archived-session-item-${session.id}`}
                    >
                      <div className="task-item-header">
                        <span className={`task-status-badge ${session.status}`}>{session.status}</span>
                        {projectName && (
                          <span
                            className="task-item-project-badge"
                            title={project?.repoPath}
                            style={{
                              fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
                              backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid var(--border)",
                              padding: "1px 6px", borderRadius: "4px", maxWidth: "120px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {projectName}
                          </span>
                        )}
                      </div>
                      <div className="task-item-prompt">{session.name || "Untitled"}</div>
                      <div className="task-item-time">{formatRelative(session.updatedAt)}</div>
                    </div>
                  </div>
                );
              });
            })()
          ) : sortedSessions.length === 0 ? (
              <div className="empty-state">
                <IconInbox />
                <p>No sessions yet.<br />Start by creating a new session.</p>
              </div>
            ) : (() => {
              const filtered = sortedSessions.filter(
                (s) =>
                  (!selectedRunnerFilter || s.runnerId === selectedRunnerFilter) &&
                  (!selectedProjectFilter || s.projectId === selectedProjectFilter)
              );
              if (filtered.length === 0) {
                return (
                  <div className="empty-state" style={{ padding: "24px 16px" }}>
                    <p>No matching sessions.</p>
                  </div>
                );
              }
              return [
                ...filtered.map((session, index) => {
                const project = projects.find((p) => p.id === session.projectId);
                const projectName = project ? project.repoPath.split("/").pop() || project.repoPath : "";
                const runner = runners.find((r) => r.id === session.runnerId);
                const runnerName = runner ? runner.name : session.runnerId || "";
                const isSwiping = swipe?.id === session.id;
                const swipeDx = isSwiping ? swipe!.dx : 0;
                const clampedDx = Math.max(0, Math.min(120, swipeDx));
                const unread = isUnviewedCompletion(session);
                const unreadColor = session.status === "error" ? "var(--error)" : "var(--success)";
                const hasPendingTodo = (session.pendingTodoMessageIds?.length ?? 0) > 0;
                const statusBadgeClass = hasPendingTodo ? "todo" : session.status;
                return (
                  <div
                    key={session.id ? `session-${session.id}` : `session-idx-${index}`}
                    className="task-item-swipe-wrapper"
                  >
                    <div className="task-item-swipe-action task-item-swipe-action-delete" style={{ opacity: clampedDx > 8 ? Math.min(1, clampedDx / SWIPE_THRESHOLD) : 0 }}>
                      <IconTrash /> Delete
                    </div>
                    <div
                      className={`task-item ${selectedSessionId === session.id ? "active" : ""} ${unread ? "unread-completion" : ""}`}
                      onClick={handleSwipeClick(() => onSelectSession(session.id))}
                      onTouchStart={handleSwipeTouchStart(session.id)}
                      onTouchMove={handleSwipeTouchMove}
                      onTouchEnd={handleSwipeTouchEnd}
                      onTouchCancel={handleSwipeTouchEnd}
                      style={{
                        transform: `translateX(${clampedDx}px)`,
                        transition: isSwiping ? "none" : "transform 0.2s ease",
                        ...(unread ? ({ "--unread-color": unreadColor } as React.CSSProperties) : {}),
                      }}
                      id={`session-item-${session.id}`}
                    >
                    <div className="task-item-header">
                      {unread && (
                        <span
                          className="task-item-unread-dot"
                          title={session.status === "error" ? "Finished with an error" : "Finished"}
                        />
                      )}
                      {session.pinnedAt && (
                        <span className="task-item-pin-badge" title="Pinned" style={{ color: "var(--text-secondary)" }}>
                          <IconPin size={11} />
                        </span>
                      )}
                      <span className={`task-status-badge ${statusBadgeClass}`}>
                        {!hasPendingTodo && (session.status === "running" || session.status === "script-running") && "⟳ "}
                        {hasPendingTodo
                          ? "TODO"
                          : session.status === "script-running"
                          ? "running"
                          : session.status}
                      </span>
                      {projectName && (
                        <span
                          className="task-item-project-badge"
                          title={project?.repoPath}
                          style={{
                            fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid var(--border)",
                            padding: "1px 6px", borderRadius: "4px", maxWidth: "120px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {projectName}
                        </span>
                      )}
                      {runnerName && (
                        <span
                          className="task-item-runner-badge"
                          title={runner ? `Runner: ${runner.name} (${runner.hostname})` : `Runner: ${session.runnerId}`}
                          style={{
                            fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid var(--border)",
                            padding: "1px 6px", borderRadius: "4px", maxWidth: "120px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {runnerName}
                        </span>
                      )}
                      <div
                        style={{ marginLeft: "auto" }}
                        ref={openSessionMenuId === session.id ? sessionMenuTriggerRef : null}
                      >
                        <button
                          className="menu-trigger-btn"
                          style={{ width: 24, height: 24 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openSessionMenuId === session.id) {
                              setOpenSessionMenuId(null);
                              return;
                            }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const MENU_WIDTH = window.matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)").matches
                              ? Math.min(230, window.innerWidth - 32)
                              : 180;
                            const MENU_HEIGHT_EST = 184;
                            const openUpward = rect.bottom + MENU_HEIGHT_EST > window.innerHeight;
                            setSessionMenuPos({
                              left: Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
                              top: openUpward ? rect.top - MENU_HEIGHT_EST - 4 : rect.bottom + 4,
                            });
                            setOpenSessionMenuId(session.id);
                          }}
                          id={`session-menu-btn-${session.id}`}
                          title="Session actions"
                        >
                          <IconMoreVertical />
                        </button>
                        {openSessionMenuId === session.id && sessionMenuPos && createPortal(
                          <div
                            className="session-dropdown-menu"
                            ref={sessionMenuPortalRef}
                            style={{ position: "fixed", top: sessionMenuPos.top, left: sessionMenuPos.left, right: "auto" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="menu-item"
                              onClick={() => {
                                onTogglePinSession(session.id, !session.pinnedAt);
                                setOpenSessionMenuId(null);
                              }}
                              id={`session-menu-pin-${session.id}`}
                            >
                              <IconPin size={14} /> {session.pinnedAt ? "Unpin" : "Pin"}
                            </button>
                            <button
                              className="menu-item"
                              onClick={() => {
                                onOpenRenameModal(session.id, session.name || "Untitled");
                                setOpenSessionMenuId(null);
                              }}
                              id={`session-menu-rename-${session.id}`}
                            >
                              <IconEdit /> Rename
                            </button>
                            <button
                              className="menu-item"
                              onClick={() => {
                                onArchiveSession(session.id);
                                setOpenSessionMenuId(null);
                              }}
                              id={`session-menu-archive-${session.id}`}
                            >
                              <IconArchive /> Archive
                            </button>
                            <button
                              className="menu-item delete"
                              onClick={() => {
                                onDeleteSession(session.id);
                                setOpenSessionMenuId(null);
                              }}
                              id={`session-menu-delete-${session.id}`}
                            >
                              <IconTrash /> Delete
                            </button>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                    <div className="task-item-prompt">{session.name || "Untitled"}</div>
                    <div className="task-item-time">{formatRelative(session.updatedAt)}</div>
                    </div>
                  </div>
                );
              }),
              ...(hasArchived ? [
                <div
                  key="archived-hint"
                  onClick={onOpenArchivedSessions}
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    padding: "6px 8px",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--radius-md)",
                    marginTop: 8,
                    marginBottom: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px dashed var(--border)",
                    transition: "color 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  <span style={{ display: "inline-flex", flexShrink: 0 }}>
                    <IconArchive size={12} />
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    You have archived sessions. Click to view.
                  </span>
                </div>
              ] : [])
            ];
          })()}
        </div>
      </aside>
    </>
  );
}
