"use client";

import { useMemo, useState } from "react";
import type { Project, Session, Runner } from "@/types/home";
import type { AgentCommand } from "@/lib/agentCommands";
import AgentCommandsManager from "@/components/AgentCommandsManager";
import { IconPlus, IconTrash, IconMoreVertical, IconFileSearch, IconTerminal, IconCommit, IconPlay } from "@/components/Icons";

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

  return <div className="project-detail-container">
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>{folderName}</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Project details</p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
