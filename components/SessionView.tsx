"use client";

import ExecCard from "@/components/ExecCard";
import type { Session, ProjectScript, Runner, Message } from "@/types/home";
import type { ExecCardInfo } from "@/lib/homeUtils";
import { formatTime, execCardInfoToItem } from "@/lib/homeUtils";
import {
  IconBolt, IconPlus, IconSend, IconCheck,
  IconGitPullRequest, IconPlay, IconTerminal, IconEdit, IconTrash,
  IconMoreVertical, IconFolder, IconChevronDown, IconFileSearch,
} from "@/components/Icons";
import { getTriggerWord, resolveAgentCommand } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";

interface SessionViewProps {
  selectedSession: Session | null;
  selectedSessionId: string | null;
  isNewSession: boolean;
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
  canSubmit: boolean;
  menuOpen: boolean;
  scriptSubMenuOpen: boolean;
  showCommandMenu: boolean;
  commandMenuIndex: number;
  sessionScripts: ProjectScript[];
  githubConfigured: boolean;
  isCreatingPr: boolean;
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
  onSetRunnerDropdownOpen: (v: boolean) => void;
  onSetAgentDropdownOpen: (v: boolean) => void;
  onSetFsCurrentPath: (path: string) => void;
  onSetFsModalOpen: (v: boolean) => void;
  onViewLog: (msgId: string) => void;
  onShowCommand: (cmd: string) => void;
  onStopExecCard: (msgId: string) => void;
  onRestartScriptCard: (msgId: string, scriptName: string) => void;
  onRetryCard: (cardInfo: ExecCardInfo) => void;
  onSubmit: () => void;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCreatePr: () => void;
  onRunScript: (name: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenShellModal: () => void;
  onOpenFileBrowser: () => void;
  onOpenRenameModal: () => void;
  onManageScripts: () => void;
  onNewSession: () => void;
  agentCommands: AgentCommand[];
  onNewSessionCommand: (name?: string) => void;
  onExecuteAgentCommand: (promptText: string) => void;
}

export default function SessionView({
  selectedSession,
  selectedSessionId,
  isNewSession,
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
  canSubmit,
  menuOpen,
  scriptSubMenuOpen,
  showCommandMenu,
  commandMenuIndex,
  sessionScripts,
  githubConfigured,
  isCreatingPr,
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
  onSetRunnerDropdownOpen,
  onSetAgentDropdownOpen,
  onSetFsCurrentPath,
  onSetFsModalOpen,
  onViewLog,
  onShowCommand,
  onStopExecCard,
  onRestartScriptCard,
  onRetryCard,
  onSubmit,
  onPromptChange,
  onKeyDown,
  onCreatePr,
  onRunScript,
  onDeleteSession,
  onOpenShellModal,
  onOpenFileBrowser,
  onOpenRenameModal,
  onManageScripts,
  agentCommands,
  onNewSession,
  onNewSessionCommand,
  onExecuteAgentCommand,
}: SessionViewProps) {
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
          <span className={`task-status-badge ${selectedSession.status}`}>
            {selectedSession.status === "running" && "⟳ "}
            {selectedSession.status === "running"
              ? "Agent working…"
              : selectedSession.status}
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
            <span
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Project:{" "}
              {selectedSession.repoPath.split("/").pop() ||
                selectedSession.repoPath}{" "}
              (
              {selectedSession.agentType === "antigravity"
                ? "Antigravity CLI"
                : selectedSession.agentType === "claude"
                  ? "Claude Code"
                  : selectedSession.agentType}
              )
            </span>
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
                  <a
                    href={`/api/sessions/${selectedSessionId}/diff`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="menu-item"
                    onClick={() => onSetMenuOpen(false)}
                    id="menu-show-diff"
                  >
                    🔍 Show Diff
                  </a>
                )}

                {selectedSession.prUrl ? (
                  <a
                    href={selectedSession.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="menu-item"
                    onClick={() => onSetMenuOpen(false)}
                    id="menu-view-pr"
                  >
                    <IconGitPullRequest /> View PR
                  </a>
                ) : (
                  selectedSession.status === "done" && (
                    <button
                      className="menu-item"
                      onClick={() => {
                        onCreatePr();
                        onSetMenuOpen(false);
                      }}
                      disabled={
                        !isGitRepo || !githubConfigured || isCreatingPr
                      }
                      title={
                        !isGitRepo
                          ? "Not a git repository"
                          : !githubConfigured
                            ? "GitHub not configured"
                            : isCreatingPr
                              ? "Creating pull request in progress..."
                              : undefined
                      }
                      id="menu-create-pr"
                    >
                      <IconGitPullRequest />{" "}
                      {isCreatingPr ? "Creating PR…" : "Create PR"}
                    </button>
                  )
                )}

                {sessionScripts.length > 0 && (
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
                        <div className="script-submenu-divider" />
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
                  disabled={selectedSession.status === "running"}
                  title={
                    selectedSession.status === "running"
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
        {!selectedSession && !isNewSession && (
          <div className="welcome-screen">
            <div className="welcome-icon">
              <IconBolt />
            </div>
            <h1 className="welcome-title">Welcome to Arondo</h1>
            <p className="welcome-desc">
              Delegate coding tasks to AI agents, review GitHub PRs on
              your phone, and ship software from anywhere — no laptop
              required.
            </p>
            <button
              className="new-task-btn"
              onClick={onNewSession}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              <IconPlus /> Create your first session
            </button>
          </div>
        )}

        {(selectedSession || isNewSession) &&
          messages.length === 0 &&
          !isRunning && (
            <div className="welcome-screen">
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {isNewSession
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
            return (
              <ExecCard
                key={msg.id}
                item={cardItem}
                onViewLog={() => onViewLog(msg.id)}
                onShowCommand={cardInfo.command ? () => onShowCommand(cardInfo.command) : undefined}
                onStopTask={isCardRunning ? () => onStopExecCard(cardInfo.runMsg.id) : undefined}
                onRestartScript={isCardRunning && cardInfo.isScript ? () => onRestartScriptCard(cardInfo.runMsg.id, cardInfo.commandLabel) : undefined}
                onRetryTask={isCardFailed ? () => onRetryCard(cardInfo) : undefined}
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
        {isNewSession && (
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
                  ...(isNewSession && !runnerId
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
                  {runners.length === 0 ? (
                    <div className="custom-dropdown-item disabled">
                      No runners connected
                    </div>
                  ) : (
                    runners.map((r) => (
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
                isNewSession && !repoPath.trim()
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
                  ...(isNewSession && !agentType
                    ? { borderColor: "var(--error)" }
                    : {}),
                }}
                id="agent-select-trigger"
              >
                <span>
                  {agentType === "antigravity"
                    ? "Antigravity CLI"
                    : agentType === "claude"
                      ? "Claude Code"
                      : agentType === "codex"
                        ? "Codex"
                        : agentType}
                </span>
                <IconChevronDown
                  className={`arrow-icon ${agentDropdownOpen ? "open" : ""}`}
                />
              </button>
              {agentDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {(
                    [
                      {
                        value: "antigravity",
                        label: "Antigravity CLI",
                        cmd: "agy",
                        comingSoon: false,
                      },
                      {
                        value: "claude",
                        label: "Claude Code",
                        cmd: "claude",
                        comingSoon: false,
                      },
                      {
                        value: "codex",
                        label: "Codex",
                        cmd: "codex",
                        comingSoon: true,
                      },
                    ] as const
                  )
                    .filter(
                      ({ cmd, comingSoon }) =>
                        !comingSoon && isAgentAvailable(cmd),
                    )
                    .map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`custom-dropdown-item ${agentType === value ? "active" : ""}`}
                        onClick={() => {
                          onSetAgentType(value);
                          onSetAgentDropdownOpen(false);
                        }}
                      >
                        <span style={{ flex: 1, textAlign: "left" }}>
                          {label}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showCommandMenu && (() => {
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
              isAgentRunning
                ? "Agent is working…"
                : isNewSession
                  ? "Describe what you want the agent to build or fix in this project…"
                  : "Send a message or follow-up feedback to the agent…"
            }
            value={prompt}
            onChange={onPromptChange}
            onKeyDown={onKeyDown}
            disabled={isAgentRunning}
            rows={1}
            id="chat-input"
          />
          <button
            className="send-btn"
            onClick={onSubmit}
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
