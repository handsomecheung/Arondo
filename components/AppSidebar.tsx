import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { IconPlus, IconInbox, IconSettings, IconServer, IconMoreVertical, IconArchive, IconArrowLeft, IconTrash } from "@/components/Icons";
import { formatRelative } from "@/lib/homeUtils";
import type { Session, Project, Runner } from "@/types/home";

const SWIPE_THRESHOLD = 72;

interface Props {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  sidebarMode: "sessions" | "projects";
  onSetSidebarMode: (mode: "sessions" | "projects") => void;
  sortedSessions: Session[];
  projects: Project[];
  runners: Runner[];
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  autoDraftSessionIds: Set<string>;
  onSelectSession: (id: string) => void;
  onSelectProject: (id: string) => void;
  onNewSession: () => void;
  onNewDraft: () => void;
  onDeleteSession: (id: string) => void;
  archivedView: boolean;
  archivedSessions: Session[];
  onOpenArchivedSessions: () => void;
  onCloseArchivedSessions: () => void;
  onSelectArchivedSession: (id: string) => void;
}

export default function AppSidebar({
  sidebarOpen,
  onCloseSidebar,
  sidebarMode,
  onSetSidebarMode,
  sortedSessions,
  projects,
  runners,
  selectedSessionId,
  selectedProjectId,
  autoDraftSessionIds,
  onSelectSession,
  onSelectProject,
  onNewSession,
  onNewDraft,
  onDeleteSession,
  archivedView,
  archivedSessions,
  onOpenArchivedSessions,
  onCloseArchivedSessions,
  onSelectArchivedSession,
}: Props) {
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [swipe, setSwipe] = useState<{ id: string; startX: number; dx: number } | null>(null);
  const lastDragDistanceRef = useRef(0);

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
                  {userRole === "admin" && (
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
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="new-task-btn" onClick={onNewSession} id="new-session-btn">
                <IconPlus /> Session
              </button>
              <button className="new-task-btn" onClick={onNewDraft} id="new-draft-btn">
                <IconPlus /> Draft
              </button>
            </div>
          </div>
          {archivedView ? (
            <button
              className="sidebar-settings-link"
              onClick={onCloseArchivedSessions}
              id="close-archived-sessions-btn"
              style={{ width: "100%", color: "var(--text-muted)" }}
            >
              <IconArrowLeft />
              <span>Archived Sessions</span>
            </button>
          ) : (
            <div className="sidebar-mode-toggle" role="tablist" aria-label="View mode">
              <button
                role="tab"
                aria-selected={sidebarMode === "sessions"}
                className={`sidebar-mode-tab${sidebarMode === "sessions" ? " active" : ""}`}
                onClick={() => onSetSidebarMode("sessions")}
              >
                Sessions
              </button>
              <button
                role="tab"
                aria-selected={sidebarMode === "projects"}
                className={`sidebar-mode-tab${sidebarMode === "projects" ? " active" : ""}`}
                onClick={() => onSetSidebarMode("projects")}
              >
                Projects
              </button>
            </div>
          )}
        </div>
        <div className="task-list">
          {archivedView ? (
            archivedSessions.length === 0 ? (
              <div className="empty-state">
                <IconArchive size={32} />
                <p>No archived sessions.</p>
              </div>
            ) : (
              archivedSessions.map((session) => {
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
                      <div className="task-item-prompt">{session.name || session.prompt}</div>
                      <div className="task-item-time">{formatRelative(session.updatedAt)}</div>
                    </div>
                  </div>
                );
              })
            )
          ) : sidebarMode === "sessions" ? (
            sortedSessions.length === 0 ? (
              <div className="empty-state">
                <IconInbox />
                <p>No sessions yet.<br />Start by creating a new session.</p>
              </div>
            ) : (
              sortedSessions.map((session, index) => {
                const project = projects.find((p) => p.id === session.projectId);
                const projectName = project ? project.repoPath.split("/").pop() || project.repoPath : "";
                const runner = runners.find((r) => r.id === session.runnerId);
                const runnerName = runner ? runner.name : session.runnerId || "";
                const isSwiping = swipe?.id === session.id;
                const swipeDx = isSwiping ? swipe!.dx : 0;
                const clampedDx = Math.max(0, Math.min(120, swipeDx));
                return (
                  <div
                    key={session.id ? `session-${session.id}` : `session-idx-${index}`}
                    className="task-item-swipe-wrapper"
                  >
                    <div className="task-item-swipe-action task-item-swipe-action-delete" style={{ opacity: clampedDx > 8 ? Math.min(1, clampedDx / SWIPE_THRESHOLD) : 0 }}>
                      <IconTrash /> Delete
                    </div>
                    <div
                      className={`task-item ${selectedSessionId === session.id ? "active" : ""}`}
                      onClick={handleSwipeClick(() => onSelectSession(session.id))}
                      onTouchStart={handleSwipeTouchStart(session.id)}
                      onTouchMove={handleSwipeTouchMove}
                      onTouchEnd={handleSwipeTouchEnd}
                      onTouchCancel={handleSwipeTouchEnd}
                      style={{
                        transform: `translateX(${clampedDx}px)`,
                        transition: isSwiping ? "none" : "transform 0.2s ease",
                      }}
                      id={`session-item-${session.id}`}
                    >
                    <div className="task-item-header">
                      <span className={`task-status-badge ${session.status}`}>
                        {(session.status === "running" || session.status === "script-running") && "⟳ "}
                        {session.status === "script-running"
                          ? "running"
                          : session.status === "draft"
                            ? (autoDraftSessionIds.has(session.id) ? "pending" : "draft")
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
                    </div>
                    <div className="task-item-prompt">{session.name || session.prompt}</div>
                    <div className="task-item-time">{formatRelative(session.createdAt)}</div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            projects.length === 0 ? (
              <div className="empty-state">
                <IconInbox />
                <p>No projects yet.<br />Create a session to initialize a project.</p>
              </div>
            ) : (
              [...projects]
              .sort((a, b) => {
                const lastActivity = (p: typeof a) => {
                  const sessionUpdatedAt = sortedSessions
                    .filter((s) => s.projectId === p.id)
                    .map((s) => s.updatedAt)
                    .sort()
                    .at(-1);
                  return Math.max(
                    new Date(p.updatedAt).getTime(),
                    sessionUpdatedAt ? new Date(sessionUpdatedAt).getTime() : 0,
                  );
                };
                return lastActivity(b) - lastActivity(a);
              })
              .map((project, index) => {
                const projectSessions = sortedSessions.filter((s) => s.projectId === project.id);
                const folderName = project.repoPath.split("/").pop() || project.repoPath;
                const projectRunner = runners.find((r) => r.id === project.runnerId);
                return (
                  <div
                    key={project.id ? `project-${project.id}` : `project-idx-${index}`}
                    className={`task-item ${selectedProjectId === project.id ? "active" : ""}`}
                    onClick={() => onSelectProject(project.id)}
                    id={`project-item-${project.id}`}
                  >
                    <div className="task-item-header">
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {projectSessions.length} session{projectSessions.length !== 1 && "s"}
                      </span>
                      {projectRunner && (
                        <span
                          className="task-item-runner-badge"
                          title={`Runner: ${projectRunner.name} (${projectRunner.hostname})`}
                          style={{
                            fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid var(--border)",
                            padding: "1px 6px", borderRadius: "4px", maxWidth: "120px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            marginLeft: "auto",
                          }}
                        >
                          {projectRunner.name}
                        </span>
                      )}
                    </div>
                    <div className="task-item-prompt" style={{ fontWeight: 600 }}>{folderName}</div>
                    <div className="task-item-prompt" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {project.repoPath}
                    </div>
                    <div className="task-item-time">{formatRelative(project.createdAt)}</div>
                  </div>
                );
              })
            )
          )}
        </div>
      </aside>
    </>
  );
}
