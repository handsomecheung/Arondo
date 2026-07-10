"use client";

import { useState, useRef, useEffect } from "react";
import ScriptExecCard from "@/components/ScriptExecCard";
import AgentExecCard from "@/components/AgentExecCard";
import ExecCard, { ExecCardItem } from "@/components/ExecCard";
import UserAgentCommandCard from "@/components/UserAgentCommandCard";
import type { Session, ProjectScript, Runner, Message } from "@/types/home";
import type { ExecCardInfo } from "@/lib/homeUtils";
import { formatTime, execCardInfoToItem } from "@/lib/homeUtils";
import {
  IconBolt, IconPlus, IconSend, IconCheck,
  IconGitPullRequest, IconPlay, IconTerminal, IconEdit, IconTrash,
  IconMoreVertical, IconFolder, IconChevronDown, IconFileSearch,
  IconClaude, IconAntigravity, IconCodex, IconFileText, IconClock,
} from "@/components/Icons";
import { getTriggerWord, resolveAgentCommand } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";

interface SessionViewProps {
  selectedSession: Session | null;
  selectedSessionId: string | null;
  isNewSession: boolean;
  isNewDraft: boolean;
  messages: Message[];
  execCards: Map<string, ExecCardInfo>;
  returnMsgIds: Set<string>;
  runners: Runner[];
  runnerAgents: string[] | undefined;
  runnerId: string;
  agentType: string;
  repoPath: string;
  prompt: string;
  isAgentRunning: boolean;
  isRunning: boolean;
  isDraftSession: boolean;
  isDraftAutoSend: boolean;
  draftTrigger: "manual" | "codebaseReady";
  canSubmit: boolean;
  menuOpen: boolean;
  scriptSubMenuOpen: boolean;
  showCommandMenu: boolean;
  commandMenuIndex: number;
  sessionScripts: ProjectScript[];
  isCheckingGitChanges: boolean;
  hasGitChanges: boolean;
  isGitRepo: boolean;
  runnerDropdownOpen: boolean;
  agentDropdownOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  runnerSelectRef: React.RefObject<HTMLDivElement | null>;
  agentSelectRef: React.RefObject<HTMLDivElement | null>;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  renderMessageContent: (content: string) => React.ReactNode;
  getSendTooltip: () => string;
  isAgentAvailable: (cmd: string) => boolean;
  onSetMenuOpen: (v: boolean) => void;
  onSetScriptSubMenuOpen: (v: boolean) => void;
  onSetRunnerId: (id: string) => void;
  onSetRepoPath: (path: string) => void;
  onSetAgentType: (type: string) => void;
  onSetDraftTrigger: (v: "manual" | "codebaseReady") => void;
  onSetRunnerDropdownOpen: (v: boolean) => void;
  onSetAgentDropdownOpen: (v: boolean) => void;
  onSetFsCurrentPath: (path: string) => void;
  onSetFsModalOpen: (v: boolean) => void;
  ws: WebSocket | null;
  onViewLog: (msgId: string) => void;
  onShowCommand: (cmd: string) => void;
  onShowPrompt: (prompt: string) => void;
  onStopExecCard: (msgId: string) => void;
  onRestartScriptCard: (msgId: string, scriptName: string) => void;
  onRetryCard: (cardInfo: ExecCardInfo) => void;
  onSubmit: () => void;
  onSendDraftNow: () => void;
  onToggleDraftTrigger: () => void;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRunScript: (name: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenShellModal: () => void;
  onOpenFileBrowser: () => void;
  onShowDiff: () => void;
  onOpenFilePath: (path: string) => void;
  onOpenRenameModal: () => void;
  onManageScripts: () => void;
  onGoToProject: () => void;
  onNewSession: () => void;
  agentCommands: AgentCommand[];
  onNewSessionCommand: (name?: string) => void;
  onExecuteAgentCommand: (promptText: string) => void;
  onExecuteScriptCommand: (promptText: string) => void;
  onSwitchAgent: (agentType: string) => void;
}

export default function SessionView({
  selectedSession,
  selectedSessionId,
  isNewSession,
  isNewDraft,
  messages,
  execCards,
  returnMsgIds,
  runners,
  runnerAgents,
  runnerId,
  agentType,
  repoPath,
  prompt,
  isAgentRunning,
  isRunning,
  isDraftSession,
  isDraftAutoSend,
  draftTrigger,
  canSubmit,
  menuOpen,
  scriptSubMenuOpen,
  showCommandMenu,
  commandMenuIndex,
  sessionScripts,
  isCheckingGitChanges,
  hasGitChanges,
  isGitRepo,
  runnerDropdownOpen,
  agentDropdownOpen,
  menuRef,
  runnerSelectRef,
  agentSelectRef,
  chatBottomRef,
  textareaRef,
  renderMessageContent,
  getSendTooltip,
  isAgentAvailable,
  onSetMenuOpen,
  onSetScriptSubMenuOpen,
  onSetRunnerId,
  onSetRepoPath,
  onSetAgentType,
  onSetDraftTrigger,
  onSetRunnerDropdownOpen,
  onSetAgentDropdownOpen,
  onSetFsCurrentPath,
  onSetFsModalOpen,
  ws,
  onViewLog,
  onShowCommand,
  onShowPrompt,
  onStopExecCard,
  onRestartScriptCard,
  onRetryCard,
  onSubmit,
  onSendDraftNow,
  onToggleDraftTrigger,
  onPromptChange,
  onKeyDown,
  onRunScript,
  onDeleteSession,
  onOpenShellModal,
  onOpenFileBrowser,
  onShowDiff,
  onOpenFilePath,
  onOpenRenameModal,
  onManageScripts,
  onGoToProject,
  agentCommands,
  onNewSession,
  onNewSessionCommand,
  onExecuteAgentCommand,
  onExecuteScriptCommand,
  onSwitchAgent,
}: SessionViewProps) {
  const activeRunnerId = selectedSession ? selectedSession.runnerId : runnerId;
  const activeRunner = runners.find((r) => r.id === activeRunnerId) ?? null;
  const isRunnerOffline = !activeRunner || !activeRunner.connected;

  const [agentSwitchOpen, setAgentSwitchOpen] = useState(false);
  const agentSwitchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentSwitchRef.current && !agentSwitchRef.current.contains(e.target as Node)) {
        setAgentSwitchOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function agentTypeLabel(type: string): string {
    if (type === "antigravity") return "Antigravity CLI";
    if (type === "claude") return "Claude Code";
    if (type === "codex") return "Codex";
    if (type === "auto") return "Auto";
    return type;
  }

  return (
    <>
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
          <span
            className={`task-status-badge ${selectedSession.status}`}
            style={
              selectedSession.status === "running" || selectedSession.status === "script-running"
                ? {
                    padding: "4px",
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }
                : undefined
            }
            title={selectedSession.status === "script-running" ? "Script running…" : "Agent working…"}
          >
            {selectedSession.status === "running" || selectedSession.status === "script-running" ? (
              <span className="agent-pulse">
                {(() => {
                  if (selectedSession.status === "script-running") {
                    return <IconTerminal size={16} strokeWidth={2.5} />;
                  }
                  const runningAgentMsg = [...messages].reverse().find(
                    (m) => m.role === "system" && m.type === "agent-run"
                  );
                  let activeAgentType =
                    runningAgentMsg?.resolvedAgentType ||
                    selectedSession.agentType ||
                    "antigravity";
                  if (activeAgentType === "auto") {
                    activeAgentType = "antigravity";
                  }

                  if (activeAgentType === "claude") {
                    return <IconClaude />;
                  } else if (activeAgentType === "codex") {
                    return <IconCodex />;
                  } else {
                    return <IconAntigravity />;
                  }
                })()}
              </span>
            ) : (
              selectedSession.status === "draft" && isDraftAutoSend ? "pending" : selectedSession.status
            )}
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--text-secondary)",
                fontFamily: "monospace",
                minWidth: 0,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                Project:{" "}
                {selectedSession.repoPath
                  ? (selectedSession.repoPath.split("/").pop() || selectedSession.repoPath)
                  : "None"}
              </span>
              <div ref={agentSwitchRef} style={{ position: "relative", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => !isRunning && setAgentSwitchOpen(!agentSwitchOpen)}
                  disabled={isRunning}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    background: "none",
                    border: "none",
                    padding: "1px 4px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "var(--text-secondary)",
                    cursor: isRunning ? "not-allowed" : "pointer",
                    opacity: isRunning ? 0.5 : 1,
                    whiteSpace: "nowrap",
                  }}
                  title="Switch agent"
                >
                  ({agentTypeLabel(selectedSession.agentType)})
                  <span
                    style={{
                      display: "inline-flex",
                      transition: "transform 0.2s ease",
                      transform: agentSwitchOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <IconChevronDown className="" />
                  </span>
                </button>
                {agentSwitchOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      zIndex: 50,
                      background: "var(--bg-surface)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-card)",
                      padding: 6,
                      minWidth: 140,
                    }}
                  >
                    {(() => {
                      const concreteAgents = (
                        [
                          { value: "antigravity", label: "Antigravity CLI", cmd: "agy" },
                          { value: "claude",      label: "Claude Code",     cmd: "claude" },
                        ] as const
                      ).filter(({ cmd }) => isAgentAvailable(cmd));
                      const showAuto = concreteAgents.length > 1;
                      const items: { value: string; label: string }[] = [
                        ...(showAuto ? [{ value: "auto", label: "Auto" }] : []),
                        ...concreteAgents,
                      ];
                      return items.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          className={`custom-dropdown-item ${selectedSession.agentType === value ? "active" : ""}`}
                          onClick={() => {
                            setAgentSwitchOpen(false);
                            if (value !== selectedSession.agentType) onSwitchAgent(value);
                          }}
                        >
                          <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
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
              onClick={() => onSetMenuOpen(!menuOpen)}
              id="session-menu-btn"
              title="Session Menu"
            >
              <IconMoreVertical />
            </button>

            {menuOpen && (
              <div className="session-dropdown-menu">
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
                  <button
                    className="menu-item"
                    onClick={() => {
                      onSetMenuOpen(false);
                      onShowDiff();
                    }}
                    id="menu-show-diff"
                  >
                    🔍 Show Diff
                  </button>
                )}

                {selectedSession?.projectId && (
                  <div
                    className="menu-item-with-sub"
                    onMouseEnter={() => onSetScriptSubMenuOpen(true)}
                    onMouseLeave={() => onSetScriptSubMenuOpen(false)}
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
                            onClick={() => onRunScript(s.name)}
                            disabled={false}
                            id={`menu-run-script-${s.name.replace(/\s+/g, "-")}`}
                            title={s.command}
                          >
                            {s.name}
                          </button>
                        ))}
                        {sessionScripts.length > 0 && <div className="script-submenu-divider" />}
                        <button
                          className="menu-item script-submenu-manage"
                          id="menu-manage-scripts"
                          onClick={onManageScripts}
                        >
                          ⚙ Edit Scripts
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  className="menu-item"
                  disabled={selectedSession ? !runners.some((r) => r.id === selectedSession.runnerId && r.connected) : true}
                  onClick={() => {
                    onOpenFileBrowser();
                    onSetMenuOpen(false);
                  }}
                  title={
                    selectedSession && !runners.some((r) => r.id === selectedSession.runnerId && r.connected)
                      ? "Runner is offline"
                      : undefined
                  }
                  id="menu-file-browser"
                >
                  <IconFileSearch /> File Browser
                </button>

                <button
                  className="menu-item"
                  disabled={selectedSession ? !runners.some((r) => r.id === selectedSession.runnerId && r.connected) : true}
                  onClick={() => {
                    onOpenShellModal();
                    onSetMenuOpen(false);
                  }}
                  title={
                    selectedSession && !runners.some((r) => r.id === selectedSession.runnerId && r.connected)
                      ? "Runner is offline"
                      : undefined
                  }
                  id="menu-open-terminal"
                >
                  <IconTerminal /> Open Terminal
                </button>

                {selectedSession.projectId && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      onGoToProject();
                      onSetMenuOpen(false);
                    }}
                    id="menu-go-to-project"
                  >
                    <IconFolder /> Go to Project
                  </button>
                )}

                {isDraftSession && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      onToggleDraftTrigger();
                      onSetMenuOpen(false);
                    }}
                    id="menu-toggle-draft-trigger"
                  >
                    <IconClock size={14} strokeWidth={2} />
                    {isDraftAutoSend ? "Switch to Manual Send" : "Switch to Auto Send"}
                  </button>
                )}

                <button
                  className="menu-item"
                  onClick={() => {
                    onOpenRenameModal();
                    onSetMenuOpen(false);
                  }}
                  id="menu-rename-session"
                >
                  <IconEdit /> Rename Session
                </button>

                <button
                  className="menu-item delete"
                  onClick={() => {
                    onDeleteSession(selectedSessionId!);
                    onSetMenuOpen(false);
                  }}
                  disabled={isRunning}
                  title={
                    isRunning
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

      <div className="chat-area" id="chat-area">
        {!selectedSession && !isNewSession && !isNewDraft && (
          <div className="welcome-screen">
            <div className="welcome-icon">
              <IconBolt />
            </div>
            <h1 className="welcome-title">Welcome to Arondo</h1>
            <p className="welcome-desc">
              Delegate coding tasks to AI agents, run tests, build and
              deploy projects, and ship software from anywhere — no laptop
              required.
            </p>
            <button
              className="new-task-btn"
              onClick={onNewSession}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              <IconPlus /> Create your session
            </button>
          </div>
        )}

        {(selectedSession || isNewSession || isNewDraft) &&
          messages.length === 0 &&
          !isRunning && (
            <div className="welcome-screen">
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {isNewDraft
                  ? "A Draft is saved now and sent later — once no agent is running and the codebase is clean, or whenever you send it manually."
                  : isNewSession
                    ? "Describe what you want the agent to do…"
                    : "No messages yet."}
              </p>
            </div>
          )}

        {messages.map((msg) => {
          if (returnMsgIds.has(msg.id)) return null;

          const cardInfo = execCards.get(msg.id);
          if (cardInfo) {
            const cardItem = execCardInfoToItem(cardInfo);
            const isCardRunning = cardItem.status === "running";
            const isCardFailed = cardItem.status === "error";
            const sharedProps = {
              item: cardItem,
              onShowCommand: cardInfo.command ? () => onShowCommand(cardInfo.command) : undefined,
              onStopTask: isCardRunning ? () => onStopExecCard(cardInfo.runMsg.id) : undefined,
              onRetryTask: isCardFailed ? () => onRetryCard(cardInfo) : undefined,
            };
            if (cardInfo.isScript) {
              return (
                <ScriptExecCard
                  key={msg.id}
                  {...sharedProps}
                  onViewLog={() => onViewLog(msg.id)}
                  onRestartScript={isCardRunning ? () => onRestartScriptCard(cardInfo.runMsg.id, cardInfo.commandLabel) : undefined}
                  sessionId={selectedSessionId!}
                  ws={ws}
                />
              );
            }
            return (
              <AgentExecCard
                key={msg.id}
                {...sharedProps}
                sessionId={selectedSessionId!}
                ws={ws}
                repoPath={selectedSession?.repoPath}
                runnerId={selectedSession?.runnerId}
                onShowPrompt={cardInfo.prompt ? () => onShowPrompt(cardInfo.prompt!) : undefined}
                onOpenFilePath={onOpenFilePath}
              />
            );
          }

          if (msg.role === "user" && msg.content.startsWith("/")) {
            const cmdWord = msg.content.trim().split(/\s+/)[0];
            return (
              <UserAgentCommandCard
                key={msg.id}
                title={cmdWord}
                statusText="Sent"
                timestamp={formatTime(msg.createdAt)}
              />
            );
          }

          return (
            <div key={msg.id} className={`message ${msg.role}`}>
              {msg.role !== "user" && (
                <div className="message-avatar">
                  {msg.role === "agent" ? "AI" : "⚙"}
                </div>
              )}
              <div>
                <div className="message-bubble">
                  {renderMessageContent(msg.content)}
                </div>
                <div className="message-time">
                  {formatTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={chatBottomRef} />
      </div>

      <div className="input-area">
        {(isNewSession || isNewDraft) && (
          <div className="input-meta">
            <div
              className="custom-dropdown-container"
              ref={runnerSelectRef}
            >
              <button
                type="button"
                className="custom-dropdown-trigger"
                onClick={() =>
                  !isRunning && onSetRunnerDropdownOpen(!runnerDropdownOpen)
                }
                disabled={isRunning}
                style={{
                  ...((isNewSession || isNewDraft) && !runnerId
                    ? { borderColor: "var(--error)" }
                    : {}),
                }}
                id="runner-select-trigger"
              >
                <span>
                  {runners.find((r) => r.id === runnerId)
                    ? `${runners.find((r) => r.id === runnerId)?.name} (${runners.find((r) => r.id === runnerId)?.hostname})`
                    : "Select Runner"}
                </span>
                <IconChevronDown
                  className={`arrow-icon ${runnerDropdownOpen ? "open" : ""}`}
                />
              </button>
              {runnerDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {runners.filter((r) => r.connected).length === 0 ? (
                    <div className="custom-dropdown-item disabled">
                      No runners connected
                    </div>
                  ) : (
                    runners
                      .filter((r) => r.connected)
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`custom-dropdown-item ${r.id === runnerId ? "active" : ""}`}
                          onClick={() => {
                            if (r.id !== runnerId) {
                              onSetRunnerId(r.id);
                              onSetRepoPath("");
                            }
                            onSetRunnerDropdownOpen(false);
                          }}
                        >
                          {r.name} ({r.hostname})
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="browse-btn"
              onClick={() => {
                if (!runnerId) return;
                const startingPath = repoPath.trim() || "/";
                onSetFsCurrentPath(startingPath);
                onSetFsModalOpen(true);
              }}
              disabled={isRunning || !runnerId}
              title={
                repoPath ? `Selected: ${repoPath}` : "Browse Directory"
              }
              id="browse-repo-btn"
              style={
                (isNewSession || isNewDraft) && !repoPath.trim()
                  ? { borderColor: "var(--error)" }
                  : {}
              }
            >
              <IconFolder />
            </button>

            <div
              className="custom-dropdown-container"
              ref={agentSelectRef}
            >
              <button
                type="button"
                className="custom-dropdown-trigger"
                onClick={() =>
                  !isRunning && onSetAgentDropdownOpen(!agentDropdownOpen)
                }
                disabled={isRunning}
                style={{
                  ...((isNewSession || isNewDraft) && !agentType
                    ? { borderColor: "var(--error)" }
                    : {}),
                }}
                id="agent-select-trigger"
              >
                <span>{agentTypeLabel(agentType)}</span>
                <IconChevronDown
                  className={`arrow-icon ${agentDropdownOpen ? "open" : ""}`}
                />
              </button>
              {agentDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {(() => {
                    const concreteAgents = (
                      [
                        { value: "antigravity", label: "Antigravity CLI", cmd: "agy", comingSoon: false },
                        { value: "claude",       label: "Claude Code",     cmd: "claude", comingSoon: false },
                        { value: "codex",        label: "Codex",           cmd: "codex",  comingSoon: true },
                      ] as const
                    ).filter(({ cmd, comingSoon }) => !comingSoon && isAgentAvailable(cmd));

                    const showAuto = concreteAgents.length > 1;
                    const items: { value: string; label: string }[] = [
                      ...(showAuto ? [{ value: "auto", label: "Auto" }] : []),
                      ...concreteAgents,
                    ];

                    return items.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`custom-dropdown-item ${agentType === value ? "active" : ""}`}
                        onClick={() => {
                          onSetAgentType(value);
                          onSetAgentDropdownOpen(false);
                        }}
                      >
                        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>

            {isNewDraft && (
              <div className="sidebar-mode-toggle" role="tablist" aria-label="Send mode" style={{ width: "auto", flex: "1 1 100%" }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={draftTrigger === "codebaseReady"}
                  className={`sidebar-mode-tab${draftTrigger === "codebaseReady" ? " active" : ""}`}
                  onClick={() => onSetDraftTrigger("codebaseReady")}
                  id="draft-trigger-auto"
                >
                  Auto — when idle &amp; clean
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={draftTrigger === "manual"}
                  className={`sidebar-mode-tab${draftTrigger === "manual" ? " active" : ""}`}
                  onClick={() => onSetDraftTrigger("manual")}
                  id="draft-trigger-manual"
                >
                  Manual only
                </button>
              </div>
            )}
          </div>
        )}

        {showCommandMenu && prompt.startsWith("!") && (() => {
          const trimmedPrompt = prompt.trim();
          const visibleScripts = sessionScripts.filter((s) => {
            const trigger = "!" + s.name;
            return trigger.startsWith(trimmedPrompt) || trimmedPrompt.startsWith(trigger);
          });
          return (
            <div className="command-menu">
              {visibleScripts.map((s, idx) => {
                const trigger = "!" + s.name;
                const isActive = trimmedPrompt === trigger;
                return (
                  <button
                    key={s.name}
                    className={`command-menu-item${commandMenuIndex === idx ? " highlighted" : ""}${isActive ? " active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onExecuteScriptCommand(trigger);
                    }}
                  >
                    <span className="command-menu-name">{trigger}</span>
                    <span className="command-menu-desc">{s.command}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {showCommandMenu && !prompt.startsWith("!") && (() => {
          let menuItemIndex = 0;
          const newVisible = ("/new").startsWith(prompt.trim()) || prompt.trim().startsWith("/new");
          const newItemIndex = newVisible ? menuItemIndex++ : -1;
          const deleteVisible = ("/delete").startsWith(prompt.trim()) || prompt.trim().startsWith("/delete");
          const deleteItemIndex = deleteVisible ? menuItemIndex++ : -1;
          return (
            <div className="command-menu">
              {newVisible ? (
                <button
                  className={`command-menu-item${commandMenuIndex === newItemIndex ? " highlighted" : ""}${prompt.trim().startsWith("/new") ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const rest = prompt.trim().slice(4).trim();
                    onNewSessionCommand(rest || undefined);
                  }}
                >
                  <span className="command-menu-name">/new [name]</span>
                  <span className="command-menu-desc">Open a new session with the same project &amp; agent</span>
                </button>
              ) : null}
              {deleteVisible ? (
                <button
                  className={`command-menu-item${commandMenuIndex === deleteItemIndex ? " highlighted" : ""}${prompt.trim() === "/delete" ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (selectedSessionId) onDeleteSession(selectedSessionId);
                  }}
                >
                  <span className="command-menu-name">/delete</span>
                  <span className="command-menu-desc">Delete the current session</span>
                </button>
              ) : null}
              {agentCommands.map((cmd, idx) => {
                const trigger = getTriggerWord(cmd);
                const slashTrigger = "/" + trigger;
                const afterSlash = prompt.trim().slice(1);
                const isBrowsingTrigger = slashTrigger.startsWith(prompt.trim());
                const matchesEntry = cmd.matcher ? new RegExp(cmd.matcher).test(afterSlash) : afterSlash === trigger;
                const triggerVisible = isBrowsingTrigger || matchesEntry;
                if (!triggerVisible) return null;
                const itemIndex = menuItemIndex++;
                const isActive = cmd.matcher
                  ? new RegExp(cmd.matcher).test(afterSlash)
                  : afterSlash === trigger;
                return (
                  <button
                    key={idx}
                    className={`command-menu-item${commandMenuIndex === itemIndex ? " highlighted" : ""}${isActive ? " active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const effectivePrompt = isActive ? prompt.trim() : slashTrigger;
                      onExecuteAgentCommand(effectivePrompt);
                    }}
                  >
                    <span className="command-menu-name">{cmd.menuLabel ?? slashTrigger}</span>
                    <span className="command-menu-desc">{cmd.menuDescription ?? ""}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={
              isRunnerOffline
                ? "Runner is offline. Chat is disabled."
                : isDraftSession
                  ? "Draft — send it now, or it may send automatically once no agent is running and the codebase is clean"
                  : isNewDraft
                    ? "Describe what you want to do — unlike a Session, a Draft won't run right away. It's held and sent once no agent is running and the codebase is clean, or whenever you send it manually."
                    : isAgentRunning
                      ? "Agent is working… your message will be queued until it finishes"
                      : isNewSession
                        ? "Describe what you want the agent to build or fix in this project…"
                        : "Send a message or follow-up feedback to the agent…"
            }
            value={isDraftSession ? selectedSession?.prompt ?? "" : prompt}
            onChange={onPromptChange}
            onKeyDown={onKeyDown}
            disabled={isRunnerOffline || isDraftSession}
            readOnly={isDraftSession}
            rows={1}
            id="chat-input"
          />
          <button
            className="send-btn"
            onClick={isDraftSession ? onSendDraftNow : onSubmit}
            disabled={!canSubmit}
            title={getSendTooltip()}
            id="send-btn"
            suppressHydrationWarning
          >
            {isNewSession && !prompt.trim() ? (
              <IconCheck />
            ) : (
              <IconSend />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
