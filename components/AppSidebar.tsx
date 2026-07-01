import Link from "next/link";
import { IconPlus, IconX, IconInbox, IconSettings } from "@/components/Icons";
import { formatRelative } from "@/lib/homeUtils";
import type { Session, Project, Runner } from "@/types/home";

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
  onSelectSession: (id: string) => void;
  onSelectProject: (id: string) => void;
  onNewSession: () => void;
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
  onSelectSession,
  onSelectProject,
  onNewSession,
}: Props) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`}
        onClick={onCloseSidebar}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header" style={{ flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sidebar-title">Menu</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="new-task-btn" onClick={onNewSession} id="new-session-btn">
                <IconPlus /> New Session
              </button>
              <button className="sidebar-close-btn" onClick={onCloseSidebar} aria-label="Close session list">
                <IconX />
              </button>
            </div>
          </div>
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
        </div>
        <div className="task-list">
          {sidebarMode === "sessions" ? (
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
                const nodeName = runner ? runner.name : session.runnerId || "";
                return (
                  <div
                    key={session.id ? `session-${session.id}` : `session-idx-${index}`}
                    className={`task-item ${selectedSessionId === session.id ? "active" : ""}`}
                    onClick={() => onSelectSession(session.id)}
                    id={`session-item-${session.id}`}
                  >
                    <div className="task-item-header">
                      <span className={`task-status-badge ${session.status}`}>
                        {(session.status === "running" || session.status === "script-running") && "⟳ "}
                        {session.status === "script-running" ? "running" : session.status}
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
                      {nodeName && (
                        <span
                          className="task-item-node-badge"
                          title={runner ? `Node: ${runner.name} (${runner.hostname})` : `Node: ${session.runnerId}`}
                          style={{
                            fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid var(--border)",
                            padding: "1px 6px", borderRadius: "4px", maxWidth: "120px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {nodeName}
                        </span>
                      )}
                    </div>
                    <div className="task-item-prompt">{session.name || session.prompt}</div>
                    <div className="task-item-time">{formatRelative(session.createdAt)}</div>
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
              projects.map((project, index) => {
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
                          className="task-item-node-badge"
                          title={`Node: ${projectRunner.name} (${projectRunner.hostname})`}
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
        <div className="sidebar-footer">
          <Link href="/settings" className="sidebar-settings-link" onClick={onCloseSidebar}>
            <IconSettings />
            <span>Settings</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
