"use client";

import type { Project, Session, ProjectScript, Runner } from "@/types/home";
import { IconPlus, IconTrash } from "@/components/Icons";

interface ProjectPanelProps {
  project: Project;
  projectSessions: Session[];
  projectScripts: ProjectScript[];
  draggedIndex: number | null;
  runners: Runner[];
  isAutoAnalyzing: boolean;
  onNewSession: () => void;
  onDeleteProject: () => void;
  onOpenScriptModal: (editingName?: string, editingCommand?: string) => void;
  onAddScriptModal: () => void;
  onDeleteScript: (name: string) => void;
  onPointerDown: (e: React.PointerEvent, index: number) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onAutoAddScripts: () => void;
  onSelectSession: (id: string) => void;
  onRunScript: (name: string) => void;
}

export default function ProjectPanel({
  project,
  projectSessions,
  projectScripts,
  draggedIndex,
  runners,
  isAutoAnalyzing,
  onNewSession,
  onDeleteProject,
  onOpenScriptModal,
  onAddScriptModal,
  onDeleteScript,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onAutoAddScripts,
  onSelectSession,
  onRunScript,
}: ProjectPanelProps) {
  const folderName = project.repoPath.split("/").pop() || project.repoPath;
  const projectRunner = runners.find((r) => r.id === project.runnerId);

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
            onClick={onNewSession}
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            <IconPlus /> New Session
          </button>
          <button
            className="delete-project-btn"
            disabled={projectSessions.length > 0}
            style={{ padding: "8px 16px", fontSize: 13 }}
            onClick={onDeleteProject}
            title={
              projectSessions.length > 0
                ? "Cannot delete project with associated sessions"
                : "Delete project"
            }
          >
            <IconTrash /> Delete Project
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
            <div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                NODE
              </span>
              {projectRunner ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: projectRunner.connected
                        ? "var(--success, #4ade80)"
                        : "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <code
                    style={{
                      fontSize: 12,
                      color: "var(--accent)",
                    }}
                    title={`${projectRunner.name} (${projectRunner.hostname})`}
                  >
                    {projectRunner.name}
                  </code>
                  <span
                    style={{
                      fontSize: 10,
                      color: projectRunner.connected
                        ? "var(--success, #4ade80)"
                        : "var(--text-muted)",
                    }}
                  >
                    {projectRunner.connected ? "connected" : "offline"}
                  </span>
                </div>
              ) : (
                <code
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  {project.runnerId}
                </code>
              )}
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

      <div className="project-section-block">
        <div className="project-section-header">
          <h3 className="project-section-title">Scripts</h3>
          <div
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <button
              className="new-task-btn"
              onClick={onAutoAddScripts}
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
              onClick={onAddScriptModal}
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
                    background:
                      draggedIndex === sidx
                        ? "var(--bg-surface)"
                        : "var(--bg-elevated)",
                    border:
                      draggedIndex === sidx
                        ? "1px dashed var(--accent)"
                        : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    opacity: draggedIndex === sidx ? 0.6 : 1,
                    transform:
                      draggedIndex === sidx
                        ? "scale(1.02)"
                        : "scale(1)",
                    transition:
                      "transform 0.1s, opacity 0.1s, background 0.1s, border 0.1s",
                    position: "relative",
                    zIndex: draggedIndex === sidx ? 10 : 1,
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
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
                        onPointerDown={(e) => onPointerDown(e, sidx)}
                        style={{
                          cursor:
                            draggedIndex === sidx ? "grabbing" : "grab",
                          userSelect: "none",
                          display: "flex",
                          alignItems: "center",
                          paddingRight: 6,
                          color:
                            draggedIndex === sidx
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          transition: "color 0.2s",
                          touchAction: "none",
                        }}
                        onMouseEnter={(e) => {
                          if (draggedIndex !== sidx) {
                            e.currentTarget.style.color =
                              "var(--text-secondary)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (draggedIndex !== sidx) {
                            e.currentTarget.style.color =
                              "var(--text-muted)";
                          }
                        }}
                      >
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
                        onClick={() => onRunScript(script.name)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--success, #4ade80)",
                          cursor: "pointer",
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          transition: "background 0.2s, color 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.background = "var(--success-bg, rgba(74, 222, 128, 0.15))";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--success, #4ade80)";
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Run
                      </button>
                      <button
                        onClick={() =>
                          onOpenScriptModal(script.name, script.command)
                        }
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
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.background = "var(--bg-surface)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-secondary)";
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteScript(script.name)}
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
                          e.currentTarget.style.background = "var(--error-bg)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
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
                  onClick={() => onSelectSession(session.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--bg-elevated)";
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
}
