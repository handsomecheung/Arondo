"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import ScriptExecCard from "@/components/ScriptExecCard";
import AgentExecCard from "@/components/AgentExecCard";
import UserAgentCommandCard from "@/components/UserAgentCommandCard";
import UserMessageCard from "@/components/UserMessageCard";
import UserTodoMessageCard from "@/components/UserTodoMessageCard";
import { ScheduleDateTimeInputs, defaultScheduleTime } from "@/components/ScheduleDateTimeInputs";
import type { Session, ProjectScript, Runner, Message, Project, TodoTrigger } from "@/types/home";
import type { ExecCardInfo } from "@/lib/homeUtils";
import { formatTime, execCardInfoToItem, autoResizeTextarea } from "@/lib/homeUtils";
import {
  IconLogo, IconPlus, IconSend, IconCheck,
  IconPlay, IconTerminal, IconEdit, IconTrash,
  IconMoreVertical, IconFolder, IconChevronDown, IconFileSearch,
  IconClaude, IconAntigravity, IconCodex, IconOpencode, IconClock,
  IconArchive, IconPin, IconPaperclip, IconX, IconCommit,
} from "@/components/Icons";
import { getTriggerWord } from "@/lib/agentCommands";
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
  projects: Project[];
  runnerAgents: string[] | undefined;
  runnerId: string;
  agentType: string;
  repoPath: string;
  prompt: string;
  isAgentRunning: boolean;
  isRunning: boolean;
  isArchived: boolean;
  onUnarchiveSession: () => void;
  isDraftSession: boolean;
  isDraftAutoSend: boolean;
  draftTrigger: "manual" | "codebaseReady" | "at";
  draftAt: number | null;
  sendScheduledAt: number | null;
  onSetSendScheduledAt: (v: number | null) => void;
  pendingSendTrigger: "manual" | "codebaseReady" | null;
  onSetPendingSendTrigger: (v: "manual" | "codebaseReady" | null) => void;
  canSubmit: boolean;
  menuOpen: boolean;
  scriptSubMenuOpen: boolean;
  showCommandMenu: boolean;
  commandMenuIndex: number;
  sessionScripts: ProjectScript[];
  scriptHistory: Record<string, number>;
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
  onSetIsNewDraft: (v: boolean) => void;
  onSetDraftTrigger: (v: "manual" | "codebaseReady" | "at") => void;
  onSetDraftAt: (v: number | null) => void;
  onSetRunnerDropdownOpen: (v: boolean) => void;
  onSetAgentDropdownOpen: (v: boolean) => void;
  onSetFsCurrentPath: (path: string) => void;
  onSetFsModalOpen: (v: boolean) => void;
  onSetFsRunnerId: (id: string) => void;
  ws: WebSocket | null;
  onViewLog: (msgId: string) => void;
  onShowCommand: (cmd: string) => void;
  onShowPrompt: (prompt: string) => void;
  onStopExecCard: (msgId: string) => void;
  onRestartScriptCard: (msgId: string, scriptName: string) => void;
  onRetryCard: (cardInfo: ExecCardInfo) => void;
  onSubmit: () => void;
  onArchiveSession: (id: string) => void;
  onTogglePinSession: (id: string, pinned: boolean) => void;
  onSendDraftNow: () => void;
  onToggleDraftTrigger: () => void;
  onCancelTodo: (messageId: string) => void;
  onSendTodoNow: (messageId: string) => void;
  onChangeTodoTrigger: (messageId: string, trigger: TodoTrigger) => void;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRunScript: (name: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenShellModal: () => void;
  onOpenFileBrowser: () => void;
  onShowDiff: () => void;
  onShowCommits: () => void;
  onOpenFilePath: (path: string) => void;
  onOpenRenameModal: () => void;
  onManageScripts: () => void;
  onGoToProject: () => void;
  onNewSession: () => void;
  agentCommands: AgentCommand[];
  onNewSessionCommand: (name?: string) => void;
  onRenameSessionCommand: (name: string) => void;
  onExecuteAgentCommand: (promptText: string) => void;
  onExecuteScriptCommand: (promptText: string) => void;
  onTriggerRunFileSelector: () => void;
  onSwitchAgent: (agentType: string) => void;
  pendingFiles: File[];
  onSelectFiles: (files: File[]) => void;
  onRemovePendingFile: (index: number) => void;
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
  projects,
  runnerId,
  agentType,
  repoPath,
  prompt,
  isAgentRunning,
  isRunning,
  isArchived,
  onUnarchiveSession,
  isDraftSession,
  isDraftAutoSend,
  draftTrigger,
  draftAt,
  sendScheduledAt,
  onSetSendScheduledAt,
  pendingSendTrigger,
  onSetPendingSendTrigger,
  canSubmit,
  menuOpen,
  scriptSubMenuOpen,
  showCommandMenu,
  commandMenuIndex,
  sessionScripts,
  scriptHistory,
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
  onSetIsNewDraft,
  onSetDraftTrigger,
  onSetDraftAt,
  onSetRunnerDropdownOpen,
  onSetAgentDropdownOpen,
  onSetFsCurrentPath,
  onSetFsModalOpen,
  onSetFsRunnerId,
  ws,
  onViewLog,
  onShowCommand,
  onShowPrompt,
  onStopExecCard,
  onRestartScriptCard,
  onRetryCard,
  onSubmit,
  onArchiveSession,
  onTogglePinSession,
  onSendDraftNow,
  onToggleDraftTrigger,
  onCancelTodo,
  onSendTodoNow,
  onChangeTodoTrigger,
  onPromptChange,
  onKeyDown,
  onRunScript,
  onDeleteSession,
  onOpenShellModal,
  onOpenFileBrowser,
  onShowDiff,
  onShowCommits,
  onOpenFilePath,
  onOpenRenameModal,
  onManageScripts,
  onGoToProject,
  agentCommands,
  onNewSession,
  onNewSessionCommand,
  onRenameSessionCommand,
  onExecuteAgentCommand,
  onExecuteScriptCommand,
  onTriggerRunFileSelector,
  onSwitchAgent,
  pendingFiles,
  onSelectFiles,
  onRemovePendingFile,
}: SessionViewProps) {
  const activeRunnerId = selectedSession ? selectedSession.runnerId : runnerId;
  const activeRunner = runners.find((r) => r.id === activeRunnerId) ?? null;
  const isRunnerOffline = !activeRunner || !activeRunner.connected;
  const sessionProjectExists = selectedSession?.projectId
    ? projects.some((p) => p.id === selectedSession.projectId)
    : true;
  const hasPendingTodo = messages.some(
    (message) => message.type === "user-todo" && message.todoStatus === "pending",
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onSelectFiles(files);
    e.target.value = "";
  };

  const [agentSwitchOpen, setAgentSwitchOpen] = useState(false);
  const [agentSwitchMenuPos, setAgentSwitchMenuPos] = useState<{ top: number; left: number } | null>(null);
  const agentSwitchRef = useRef<HTMLDivElement>(null);
  const scriptSubMenuRef = useRef<HTMLDivElement>(null);
  const [scriptSubMenuShift, setScriptSubMenuShift] = useState(0);
  const commandSubMenuRef = useRef<HTMLDivElement>(null);
  const [commandSubMenuOpen, setCommandSubMenuOpen] = useState(false);
  const [commandSubMenuShift, setCommandSubMenuShift] = useState(0);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectSelectRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState<"closed" | "menu" | "schedule">("closed");
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!scriptSubMenuOpen || !scriptSubMenuRef.current) {
      setScriptSubMenuShift(0);
      return;
    }
    const rect = scriptSubMenuRef.current.getBoundingClientRect();
    const overflow = 8 - rect.left;
    setScriptSubMenuShift(overflow > 0 ? overflow : 0);
  }, [scriptSubMenuOpen]);

  useLayoutEffect(() => {
    if (!commandSubMenuOpen || !commandSubMenuRef.current) {
      setCommandSubMenuShift(0);
      return;
    }
    const rect = commandSubMenuRef.current.getBoundingClientRect();
    const overflow = 8 - rect.left;
    setCommandSubMenuShift(overflow > 0 ? overflow : 0);
  }, [commandSubMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentSwitchRef.current && !agentSwitchRef.current.contains(e.target as Node)) {
        setAgentSwitchOpen(false);
      }
      if (projectSelectRef.current && !projectSelectRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // The attach menu swaps its own content on click (menu -> schedule panel),
  // which unmounts the clicked node before a "click" listener on document
  // would see it — contains() then wrongly reports "outside" and closes the
  // menu right after it opens. "mousedown" fires before that re-render, so
  // it still finds the node attached.
  useEffect(() => {
    const handleMouseDownOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen("closed");
      }
    };
    document.addEventListener("mousedown", handleMouseDownOutside);
    return () => document.removeEventListener("mousedown", handleMouseDownOutside);
  }, []);

  const chatInputPlaceholder = isArchived
    ? "This session is archived. Unarchive it to send messages."
    : isRunnerOffline
    ? "Runner is offline. Chat is disabled."
    : isDraftSession
      ? "This session has a pending Todo message — type to queue another, or hit Send to dispatch it now."
      : isNewDraft
        ? "Describe the TODO message to send later."
        : isAgentRunning
          ? "Agent is working… your message will be queued until it finishes"
          : isNewSession
            ? "Describe what you want the agent to build or fix in this project…"
            : "Send a message or follow-up feedback to the agent…";

  const chatInputValue = prompt;
  const [collapseViewedAt, setCollapseViewedAt] = useState<string | false | null>(null);

  // Resize to fit the placeholder whenever it changes while the input is empty,
  // so the box previews how much room a longer message will need.
  useLayoutEffect(() => {
    if (chatInputValue) return;
    if (textareaRef.current) autoResizeTextarea(textareaRef.current);
  }, [chatInputPlaceholder, chatInputValue, textareaRef]);

  function agentTypeLabel(type: string): string {
    if (type === "antigravity") return "Antigravity CLI";
    if (type === "claude") return "Claude Code";
    if (type === "codex") return "Codex";
    if (type === "opencode") return "OpenCode";
    if (type === "auto") return "Auto";
    return type;
  }

  useEffect(() => {
    setCollapseViewedAt(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || !selectedSession || collapseViewedAt !== null) return;
    setCollapseViewedAt(selectedSession.lastViewedAt ?? false);
  }, [selectedSessionId, selectedSession, collapseViewedAt]);

  const latestCompletedExecCardId = [...messages].reverse().find((message) => {
    const cardInfo = execCards.get(message.id);
    return !!cardInfo?.returnMsg;
  })?.id;

  function shouldDefaultCollapseExecCard(cardInfo: ExecCardInfo, cardStatus: string): boolean {
    if (typeof collapseViewedAt !== "string") return false;
    if (!cardInfo.returnMsg) return false;
    if (cardStatus === "running" || cardStatus === "error") return false;
    if (cardInfo.runMsg.id === latestCompletedExecCardId) return false;

    const viewedAt = new Date(collapseViewedAt).getTime();
    const cardCreatedAt = new Date(cardInfo.runMsg.createdAt).getTime();
    if (!Number.isFinite(viewedAt) || !Number.isFinite(cardCreatedAt)) return false;

    return cardCreatedAt <= viewedAt;
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
            className={`task-status-badge ${hasPendingTodo ? "todo" : selectedSession.status}`}
            style={
              !hasPendingTodo && (selectedSession.status === "running" || selectedSession.status === "script-running")
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
            title={hasPendingTodo ? "TODO message pending" : selectedSession.status === "script-running" ? "Script running…" : "Agent working…"}
          >
            {!hasPendingTodo && (selectedSession.status === "running" || selectedSession.status === "script-running") ? (
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
                  } else if (activeAgentType === "opencode") {
                    return <IconOpencode />;
                  } else {
                    return <IconAntigravity />;
                  }
                })()}
              </span>
            ) : (
              hasPendingTodo ? "TODO" : selectedSession.status
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
              {selectedSession.name || "Untitled"}
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
                  onClick={(e) => {
                    if (isArchived) return;
                    if (agentSwitchOpen) {
                      setAgentSwitchOpen(false);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const menuWidth = Math.min(260, window.innerWidth - 32);
                    setAgentSwitchMenuPos({
                      top: rect.bottom + 4,
                      left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
                    });
                    setAgentSwitchOpen(true);
                  }}
                  disabled={isArchived}
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
                    cursor: "pointer",
                    opacity: 1,
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
                {agentSwitchOpen && agentSwitchMenuPos && (
                  <div
                    className="session-agent-switch-menu"
                    style={{
                      position: "fixed",
                      top: agentSwitchMenuPos.top,
                      left: agentSwitchMenuPos.left,
                      zIndex: 50,
                      background: "var(--bg-surface)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-card)",
                      padding: 6,
                    }}
                  >
                    {(() => {
                      const concreteAgents = (
                        [
                          { value: "antigravity", label: "Antigravity CLI", cmd: "agy" },
                          { value: "claude",      label: "Claude Code",     cmd: "claude" },
                          { value: "codex",       label: "Codex",           cmd: "codex" },
                          { value: "opencode",    label: "OpenCode",        cmd: "opencode" },
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

            {menuOpen && isArchived && (
              <div className="session-dropdown-menu">
                <button
                  className="menu-item"
                  disabled={!sessionProjectExists}
                  onClick={() => {
                    if (!sessionProjectExists) return;
                    onUnarchiveSession();
                    onSetMenuOpen(false);
                  }}
                  id="menu-unarchive-session"
                  title={
                    sessionProjectExists
                      ? undefined
                      : "The project this session belongs to no longer exists"
                  }
                >
                  <IconArchive /> Unarchive
                </button>

                <button
                  className="menu-item delete"
                  onClick={() => {
                    onDeleteSession(selectedSessionId!);
                    onSetMenuOpen(false);
                  }}
                  id="menu-delete-session"
                >
                  <IconTrash /> Delete
                </button>
              </div>
            )}

            {menuOpen && !isArchived && (
              <div className="session-dropdown-menu">
                {!isGitRepo ? (
                  <button
                    className="menu-item"
                    disabled={true}
                    id="menu-show-diff"
                    title="Not a git repository"
                  >
                    🔍 Show Changes
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
                    🔍 {isCheckingGitChanges ? "Show Changes" : "No Changes"}
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
                    🔍 Show Changes
                  </button>
                )}

                {isGitRepo && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      onSetMenuOpen(false);
                      onShowCommits();
                    }}
                    id="menu-show-commits"
                  >
                    <IconCommit /> Show Commits
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
                      id="menu-run-script"
                    >
                      <IconPlay /> Run Script
                      <span className="menu-item-arrow">›</span>
                    </button>
                    {scriptSubMenuOpen && (
                      <div
                        className="script-submenu"
                        ref={scriptSubMenuRef}
                        style={scriptSubMenuShift > 0 ? { transform: `translateX(${scriptSubMenuShift}px)` } : undefined}
                      >
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

                <div
                  className="menu-item-with-sub"
                  onMouseEnter={() => setCommandSubMenuOpen(true)}
                  onMouseLeave={() => setCommandSubMenuOpen(false)}
                >
                  <button
                    className="menu-item"
                    id="menu-run-command"
                  >
                    <IconPlay /> Run Command
                    <span className="menu-item-arrow">›</span>
                  </button>
                  {commandSubMenuOpen && (
                    <div
                      className="command-submenu"
                      ref={commandSubMenuRef}
                      style={commandSubMenuShift > 0 ? { transform: `translateX(${commandSubMenuShift}px)` } : undefined}
                    >
                      {agentCommands.map((command) => {
                        const trigger = `/${getTriggerWord(command)}`;
                        return (
                          <button
                            key={command.command}
                            className="menu-item"
                            onClick={() => {
                              onSetMenuOpen(false);
                              setCommandSubMenuOpen(false);
                              onExecuteAgentCommand(trigger);
                            }}
                            id={`menu-run-command-${command.command.replace(/\s+/g, "-")}`}
                            title={command.menuDescription}
                          >
                            {command.menuLabel ?? trigger}
                          </button>
                        );
                      })}
                      <Link
                        href="/settings"
                        className="menu-item command-submenu-manage"
                        id="menu-manage-commands"
                        onClick={() => {
                          onSetMenuOpen(false);
                          setCommandSubMenuOpen(false);
                        }}
                      >
                        ⚙ Edit Commands
                      </Link>
                    </div>
                  )}
                </div>

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
                    onTogglePinSession(selectedSessionId!, !selectedSession.pinnedAt);
                    onSetMenuOpen(false);
                  }}
                  id="menu-pin-session"
                >
                  <IconPin /> {selectedSession.pinnedAt ? "Unpin" : "Pin"}
                </button>

                <button
                  className="menu-item"
                  onClick={() => {
                    onOpenRenameModal();
                    onSetMenuOpen(false);
                  }}
                  id="menu-rename-session"
                >
                  <IconEdit /> Rename
                </button>

                <button
                  className="menu-item"
                  onClick={() => {
                    onArchiveSession(selectedSessionId!);
                    onSetMenuOpen(false);
                  }}
                  disabled={isRunning}
                  title={
                    isRunning
                      ? "Cannot archive a running session"
                      : undefined
                  }
                  id="menu-archive-session"
                >
                  <IconArchive /> Archive
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
                  <IconTrash /> Delete
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
              <IconLogo />
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
                  ? "This TODO message is saved now and sent according to the selected mode."
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
              collapsible: !isCardRunning,
              defaultCollapsed: shouldDefaultCollapseExecCard(cardInfo, cardItem.status),
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

          if (msg.type === "user-todo") {
            return (
              <UserTodoMessageCard
                key={msg.id}
                content={msg.content}
                timestamp={formatTime(msg.createdAt)}
                trigger={msg.todoTrigger}
                status={msg.todoStatus}
                isFollowup={messages.length > 0 && messages[0].id !== msg.id}
                renderContent={renderMessageContent}
                onCancel={() => onCancelTodo(msg.id)}
                onSendNow={() => onSendTodoNow(msg.id)}
                onChangeTrigger={(trigger) => onChangeTodoTrigger(msg.id, trigger)}
                userName={msg.userName}
                userColor={msg.userColor}
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
                userName={msg.userName}
                userColor={msg.userColor}
              />
            );
          }

          if (msg.role === "user") {
            return (
              <UserMessageCard
                key={msg.id}
                content={msg.content}
                timestamp={formatTime(msg.createdAt)}
                renderContent={renderMessageContent}
                userName={msg.userName}
                userColor={msg.userColor}
              />
            );
          }

          return (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === "agent" ? "AI" : "⚙"}
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
          );
        })}

        <div ref={chatBottomRef} />
      </div>

      <div className="input-area">
        {(isNewSession || isNewDraft) && (
          <div className="input-meta">
            <div className="input-meta-row">
              <span className="input-label input-meta-row-label">Runner:</span>
              <div
                className="custom-dropdown-container new-session-dropdown-container"
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
                  <div className="custom-dropdown-menu new-session-dropdown-menu">
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
            </div>

            <div className="input-meta-row">
              <span className="input-label input-meta-row-label">Project:</span>
              <div
                className="custom-dropdown-container new-session-dropdown-container"
                ref={projectSelectRef}
              >
                <button
                  type="button"
                  className="custom-dropdown-trigger"
                  onClick={() =>
                    !isRunning && runnerId && setProjectDropdownOpen(!projectDropdownOpen)
                  }
                  disabled={isRunning || !runnerId}
                  style={
                    (isNewSession || isNewDraft) && !repoPath.trim()
                      ? { borderColor: "var(--error)" }
                      : {}
                  }
                  id="project-select-trigger"
                >
                  <span>
                    {(() => {
                      const runnerProjects = projects.filter((p) => p.runnerId === runnerId);
                      const matched = runnerProjects.find((p) => p.repoPath === repoPath);
                      if (matched) return matched.repoPath.split("/").pop() || matched.repoPath;
                      if (repoPath.trim()) return repoPath.split("/").pop() || repoPath;
                      return runnerId ? "Select Project" : "Select runner first";
                    })()}
                  </span>
                  <IconChevronDown
                    className={`arrow-icon ${projectDropdownOpen ? "open" : ""}`}
                  />
                </button>
                {projectDropdownOpen && (
                  <div className="custom-dropdown-menu new-session-dropdown-menu">
                    {projects.filter((p) => p.runnerId === runnerId).length === 0 ? (
                      <div className="custom-dropdown-item disabled">
                        No projects on this runner
                      </div>
                    ) : (
                      projects
                        .filter((p) => p.runnerId === runnerId)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`custom-dropdown-item ${p.repoPath === repoPath ? "active" : ""}`}
                            onClick={() => {
                              onSetRepoPath(p.repoPath);
                              setProjectDropdownOpen(false);
                            }}
                            title={p.repoPath}
                          >
                            {p.repoPath.split("/").pop() || p.repoPath}
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
                  onSetFsRunnerId(runnerId);
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
            </div>

            <div className="input-meta-row">
              <span className="input-label input-meta-row-label">Agent:</span>
              <div
                className="custom-dropdown-container new-session-dropdown-container"
                ref={agentSelectRef}
              >
                <button
                  type="button"
                  className="custom-dropdown-trigger"
                  onClick={() =>
                    onSetAgentDropdownOpen(!agentDropdownOpen)
                  }
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
                  <div className="custom-dropdown-menu new-session-dropdown-menu">
                    {(() => {
                      const concreteAgents = (
                        [
                          { value: "antigravity", label: "Antigravity CLI", cmd: "agy", comingSoon: false },
                          { value: "claude",       label: "Claude Code",     cmd: "claude", comingSoon: false },
                          { value: "codex",        label: "Codex",           cmd: "codex",  comingSoon: false },
                          { value: "opencode",     label: "OpenCode",        cmd: "opencode", comingSoon: false },
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
            </div>

            <label className="todo-message-switch" htmlFor="todo-message-toggle">
              <span>TODO Message</span>
              <input
                id="todo-message-toggle"
                type="checkbox"
                checked={isNewDraft}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  onSetIsNewDraft(enabled);
                  if (enabled) {
                    onSetDraftTrigger("codebaseReady");
                    onSetDraftAt(null);
                  }
                }}
              />
              <span className="todo-message-switch-track" aria-hidden="true" />
            </label>

            {isNewDraft && (
              <>
                <div className="sidebar-mode-toggle draft-send-toggle" role="tablist" aria-label="Send mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftTrigger === "codebaseReady"}
                    className={`sidebar-mode-tab${draftTrigger === "codebaseReady" ? " active" : ""}`}
                    onClick={() => onSetDraftTrigger("codebaseReady")}
                    id="draft-trigger-auto"
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftTrigger === "manual"}
                    className={`sidebar-mode-tab${draftTrigger === "manual" ? " active" : ""}`}
                    onClick={() => onSetDraftTrigger("manual")}
                    id="draft-trigger-manual"
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftTrigger === "at"}
                    className={`sidebar-mode-tab${draftTrigger === "at" ? " active" : ""}`}
                    onClick={() => {
                      onSetDraftTrigger("at");
                      if (!draftAt) onSetDraftAt(defaultScheduleTime());
                    }}
                    id="draft-trigger-at"
                  >
                    Scheduled
                  </button>
                </div>
                {draftTrigger === "at" ? (
                  <ScheduleDateTimeInputs value={draftAt} onChange={onSetDraftAt} />
                ) : (
                  <div className="draft-trigger-hint">
                    {draftTrigger === "codebaseReady"
                      ? "Sends automatically once no agent is running and the codebase is clean."
                      : "Saved as a draft — send it yourself whenever you're ready."}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {showCommandMenu && prompt.startsWith("!") && (() => {
          const trimmedPrompt = prompt.trim();
          const visibleScripts = sessionScripts.filter((s) => {
            const trigger = "!" + s.name;
            return trigger.startsWith(trimmedPrompt) || trimmedPrompt.startsWith(trigger);
          });
          const topHistoryCommands = Object.entries(scriptHistory)
            .filter(([command]) => !sessionScripts.some((s) => s.command === command))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([command]) => command);
          return (
            <div className="command-menu">
              <button
                className="command-menu-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onManageScripts();
                }}
              >
                <span className="command-menu-name">⚙ Edit Scripts</span>
              </button>
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
              {topHistoryCommands.map((command) => {
                const trigger = "!" + command;
                const isActive = trimmedPrompt === trigger;
                return (
                  <button
                    key={`history-${command}`}
                    className={`command-menu-item${isActive ? " active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onExecuteScriptCommand(trigger);
                    }}
                  >
                    <span className="command-menu-name">{command}</span>
                  </button>
                );
              })}
              <button
                className="command-menu-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onTriggerRunFileSelector();
                }}
              >
                <span className="command-menu-name"><IconFolder /> Select…</span>
              </button>
            </div>
          );
        })()}

        {showCommandMenu && !prompt.startsWith("!") && (() => {
          let menuItemIndex = 0;
          const newVisible = ("/new").startsWith(prompt.trim()) || prompt.trim().startsWith("/new");
          const newItemIndex = newVisible ? menuItemIndex++ : -1;
          const deleteVisible = ("/delete").startsWith(prompt.trim()) || prompt.trim().startsWith("/delete");
          const deleteItemIndex = deleteVisible ? menuItemIndex++ : -1;
          const renameVisible = ("/rename").startsWith(prompt.trim()) || prompt.trim().startsWith("/rename");
          const renameItemIndex = renameVisible ? menuItemIndex++ : -1;
          const renameName = prompt.trim().slice("/rename".length).trim();
          return (
            <div className="command-menu">
              <Link
                href="/settings"
                className="command-menu-item"
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="command-menu-name">⚙ Edit Commands</span>
              </Link>
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
              {renameVisible ? (
                <button
                  className={`command-menu-item${commandMenuIndex === renameItemIndex ? " highlighted" : ""}${prompt.trim().startsWith("/rename") ? " active" : ""}`}
                  disabled={!renameName}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (renameName) onRenameSessionCommand(renameName);
                  }}
                >
                  <span className="command-menu-name">/rename &lt;name&gt;</span>
                  <span className="command-menu-desc">Rename the current session</span>
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

        {(pendingFiles.length > 0 || sendScheduledAt || pendingSendTrigger) && (
          <div className="pending-files-list">
            {sendScheduledAt && (
              <div className="pending-file-chip scheduled-send-chip">
                <IconClock size={13} />
                <span className="pending-file-name">Scheduled for {new Date(sendScheduledAt).toLocaleString()}</span>
                <button
                  className="pending-file-remove"
                  onClick={() => onSetSendScheduledAt(null)}
                  title="Cancel scheduled send"
                  type="button"
                >
                  <IconX />
                </button>
              </div>
            )}
            {pendingSendTrigger && (
              <div className="pending-file-chip scheduled-send-chip">
                <IconClock size={13} />
                <span className="pending-file-name">
                  {pendingSendTrigger === "manual"
                    ? "Will be queued — send manually later"
                    : "Will send once the codebase is clean"}
                </span>
                <button
                  className="pending-file-remove"
                  onClick={() => onSetPendingSendTrigger(null)}
                  title="Cancel"
                  type="button"
                >
                  <IconX />
                </button>
              </div>
            )}
            {pendingFiles.map((file, i) => (
              <div key={i} className="pending-file-chip">
                <IconPaperclip size={13} />
                <span className="pending-file-name" title={file.name}>{file.name}</span>
                <button
                  className="pending-file-remove"
                  onClick={() => onRemovePendingFile(i)}
                  title="Remove attachment"
                  type="button"
                >
                  <IconX />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleUploadChange}
          />
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={chatInputPlaceholder}
            value={chatInputValue}
            onChange={onPromptChange}
            onKeyDown={onKeyDown}
            disabled={isRunnerOffline || isArchived}
            readOnly={isArchived}
            rows={1}
            id="chat-input"
          />
          <div className="input-actions-col">
            <div className="attach-menu-container" ref={attachMenuRef}>
              <button
                className="upload-btn"
                onClick={() => setAttachMenuOpen((v) => (v === "closed" ? "menu" : "closed"))}
                disabled={isRunnerOffline || isArchived}
                title="Attach a file or schedule this message"
                type="button"
              >
                <IconPlus />
              </button>
              {attachMenuOpen === "menu" && (
                <div className="attach-menu-popup">
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setAttachMenuOpen("closed");
                      uploadInputRef.current?.click();
                    }}
                  >
                    <IconPaperclip />
                    <span>Upload File</span>
                  </button>
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setAttachMenuOpen("schedule");
                      onSetPendingSendTrigger(null);
                      if (!sendScheduledAt) onSetSendScheduledAt(defaultScheduleTime());
                    }}
                  >
                    <IconClock />
                    <span>Schedule Send</span>
                  </button>
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setAttachMenuOpen("closed");
                      onSetSendScheduledAt(null);
                      onSetPendingSendTrigger("manual");
                    }}
                  >
                    <IconClock />
                    <span>Send Later</span>
                  </button>
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setAttachMenuOpen("closed");
                      onSetSendScheduledAt(null);
                      onSetPendingSendTrigger("codebaseReady");
                    }}
                  >
                    <IconClock />
                    <span>Send When Clean</span>
                  </button>
                </div>
              )}
              {attachMenuOpen === "schedule" && (
                <div className="attach-menu-popup attach-schedule-panel">
                  <ScheduleDateTimeInputs value={sendScheduledAt} onChange={onSetSendScheduledAt} />
                  <div className="attach-schedule-panel-actions">
                    <button type="button" onClick={() => setAttachMenuOpen("menu")}>Back</button>
                    <button
                      type="button"
                      className="primary"
                      disabled={!sendScheduledAt}
                      onClick={() => setAttachMenuOpen("closed")}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="send-btn"
              onClick={isDraftSession && !prompt.trim() ? onSendDraftNow : onSubmit}
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
      </div>
    </>
  );
}
