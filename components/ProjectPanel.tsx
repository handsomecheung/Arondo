"use client";

import { useMemo, useState } from "react";
import type { Project, Session, Runner } from "@/types/home";
import type { AgentCommand } from "@/lib/agentCommands";
import AgentCommandsManager from "@/components/AgentCommandsManager";
import { IconPlus, IconTrash, IconMoreVertical, IconFileSearch, IconTerminal, IconCommit, IconPlay, IconFolder } from "@/components/Icons";

interface ProjectPanelProps {
  project: Project;
  projectSessions: Session[];
  projectAgentCommands: AgentCommand[];
  scriptHistory: Record<string, number>;
  runners: Runner[];
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onSetMenuOpen: (v: boolean) => void;
  onNewSession: () => void;
  onDeleteProject: () => void;
  onOpenFileBrowser: () => void;
  onOpenShellModal: () => void;
  onOpenProjectScriptCommand: (command?: string) => void;
  onRunProjectScript: (command: string) => void;
  onSelectProjectScriptFile: () => void;
  onSaveAgentCommand: (command: AgentCommand) => Promise<void>;
  onDeleteAgentCommand: (command: string) => Promise<void>;
  onConfirmDeleteAgentCommand: (command: string, onConfirm: () => Promise<void>) => void;
  onSelectSession: (id: string) => void;
  onShowDiff: () => void;
  onShowCommits: () => void;
  isCheckingGitChanges: boolean;
  hasGitChanges: boolean;
  isGitRepo: boolean;
}

export default function ProjectPanel({
  project, projectSessions, projectAgentCommands, scriptHistory, runners, menuOpen, menuRef, onSetMenuOpen,
  onNewSession, onDeleteProject, onOpenFileBrowser, onOpenShellModal, onSaveAgentCommand,
  onDeleteAgentCommand, onConfirmDeleteAgentCommand, onSelectSession, onShowDiff, onShowCommits,
  isCheckingGitChanges, hasGitChanges, isGitRepo, onOpenProjectScriptCommand, onRunProjectScript, onSelectProjectScriptFile,
}: ProjectPanelProps) {
  const folderName = project.repoPath.split("/").pop() || project.repoPath;
  const projectRunner = runners.find((runner) => runner.id === project.runnerId);
  const [runScriptMenuOpen, setRunScriptMenuOpen] = useState(false);
  const topHistoryCommands = useMemo(() => Object.entries(scriptHistory)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5)
    .map(([command]) => command), [scriptHistory]);

  const { pathStart, pathEnd } = useMemo(() => {
    const raw = project.repoPath;
    const segments = raw.split("/").filter(Boolean);
    if (segments.length <= 1) {
      return { pathStart: raw, pathEnd: "" };
    }
    const lastTwo = `/${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
    const end = (segments.length >= 3 && lastTwo.length <= 25)
      ? lastTwo
      : `/${segments[segments.length - 1]}`;
    const start = raw.slice(0, raw.length - end.length);
    return { pathStart: start, pathEnd: end };
  }, [project.repoPath]);

  return <div className="project-detail-container">
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folderName}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button className="new-task-btn" onClick={onNewSession} style={{ padding: "8px 16px", fontSize: 13 }}><IconPlus /> New Session</button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button className="menu-trigger-btn" onClick={() => onSetMenuOpen(!menuOpen)} id="project-menu-btn" title="Project Menu"><IconMoreVertical /></button>
            {menuOpen && <div className="session-dropdown-menu">
              <button className="menu-item" disabled={!isGitRepo || isCheckingGitChanges || !hasGitChanges} onClick={() => { onSetMenuOpen(false); onShowDiff(); }} id="menu-show-diff">
                🔍 {isCheckingGitChanges ? "Show Changes" : hasGitChanges ? "Show Changes" : "No Changes"}
              </button>
              {isGitRepo && <button className="menu-item" onClick={() => { onSetMenuOpen(false); onShowCommits(); }} id="menu-show-commits"><IconCommit /> Show Commits</button>}
              <button className="menu-item" disabled={!projectRunner?.connected} onClick={() => { onOpenFileBrowser(); onSetMenuOpen(false); }}><IconFileSearch /> File Browser</button>
              <button className="menu-item" disabled={!projectRunner?.connected} onClick={() => { onOpenShellModal(); onSetMenuOpen(false); }}><IconTerminal /> Open Terminal</button>
              <button className="menu-item danger" onClick={() => { onSetMenuOpen(false); onDeleteProject(); }}><IconTrash /> Delete Project</button>
            </div>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onOpenFileBrowser}
          disabled={!projectRunner?.connected}
          title={!projectRunner?.connected ? "Runner is offline" : `Browse ${project.repoPath}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 6px",
            marginLeft: -6,
            background: "none",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: projectRunner?.connected ? "var(--text-muted)" : "var(--text-disabled, #888)",
            fontSize: 12,
            fontFamily: "monospace",
            cursor: projectRunner?.connected ? "pointer" : "not-allowed",
            textAlign: "left",
            maxWidth: "100%",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (projectRunner?.connected) {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.background = "var(--bg-elevated)";
            }
          }}
          onMouseLeave={(e) => {
            if (projectRunner?.connected) {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "none";
            }
          }}
        >
          <span style={{ display: "inline-flex", flexShrink: 0 }}><IconFolder /></span>
          <span style={{ display: "inline-flex", minWidth: 0, overflow: "hidden", maxWidth: "100%" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
              {pathStart}
            </span>
            {pathEnd && (
              <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {pathEnd}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>

    <div className="project-section-block">
      <AgentCommandsManager title="Project Agent Commands" description="Project-specific slash commands saved to agent-commands.json in this project." commands={projectAgentCommands} canEdit onSave={onSaveAgentCommand} onDelete={onDeleteAgentCommand} onRequestDeleteConfirm={onConfirmDeleteAgentCommand} />
    </div>

    <div className="project-section-block project-scripts-section">
      <div className="project-section-header">
        <h3 className="project-section-title">Scripts</h3>
        <div style={{ position: "relative" }}>
          <button
            className="new-task-btn"
            onClick={() => setRunScriptMenuOpen((open) => !open)}
            disabled={!projectRunner?.connected}
            style={{ padding: "6px 14px", fontSize: 12 }}
          >
            <IconPlay /> Run Script
          </button>
          {runScriptMenuOpen && (
            <div className="session-dropdown-menu" style={{ right: 0, top: "calc(100% + 6px)", zIndex: 20 }}>
              {topHistoryCommands.map((command) => (
                <button
                  key={command}
                  className="menu-item"
                  title={command}
                  onClick={() => { setRunScriptMenuOpen(false); onRunProjectScript(command); }}
                >
                  {command}
                </button>
              ))}
              <button className="menu-item" onClick={() => { setRunScriptMenuOpen(false); onSelectProjectScriptFile(); }}>
                <IconFileSearch /> Select
              </button>
              <button className="menu-item" onClick={() => { setRunScriptMenuOpen(false); onOpenProjectScriptCommand(); }}>
                <IconPlay /> Enter command
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="project-section-body" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        Run a command in this project. Commands are saved to the project script history.
      </div>
    </div>

    <div className="project-section-block">
      <div className="project-section-header">
        <h3 className="project-section-title">Sessions</h3>
        <span className="project-section-count">{projectSessions.length}</span>
      </div>
      <div className="project-section-body">
        {projectSessions.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-muted)" }}>
            No sessions created for this project yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projectSessions.map((session) => (
              <div
                key={session.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", transition: "background 0.2s" }}
                onClick={() => onSelectSession(session.id)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`task-status-badge ${session.status}`}>{session.status}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {session.name || "Untitled"}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 16 }}>
                  {new Date(session.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>;
}
