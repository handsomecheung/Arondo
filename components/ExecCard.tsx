"use client";

import { useState, useRef, useEffect } from "react";

export interface ExecCardItem {
  id: string;
  type: "agent" | "script";
  title: string;
  status: "running" | "done" | "error" | "stopped";
  statusText: string;
  command?: string;
  messageId?: string;
  timestamp?: string;
}

interface ExecCardProps {
  item: ExecCardItem;
  onViewLog?: () => void;
  onShowCommand?: () => void;
  onStopTask?: () => void;
  onRestartScript?: () => void;
  onRetryTask?: () => void;
}

function IconMoreVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function IconRestart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
    </svg>
  );
}

function IconRetry() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-.49-4.95" />
    </svg>
  );
}

export default function ExecCard({ item, onViewLog, onShowCommand, onStopTask, onRestartScript, onRetryTask }: ExecCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isRunning = item.status === "running";
  const isFailed = item.status === "error";
  const hasLog = !!item.messageId;

  let statusClass = "exec-card-running";
  if (!isRunning) {
    if (item.status === "done") statusClass = "exec-card-success";
    else if (item.status === "stopped") statusClass = "exec-card-stopped";
    else statusClass = "exec-card-error";
  }

  const hasMenuItems =
    (!!item.command && onShowCommand) ||
    (hasLog && onViewLog) ||
    (isRunning && hasLog && onStopTask) ||
    (isRunning && item.type === "script" && onRestartScript) ||
    (isFailed && onRetryTask);

  return (
    <div className={`exec-card ${statusClass}`}>
      <div className="exec-card-header">
        <div className="exec-card-icon">
          {isRunning ? (
            <span className="exec-card-spinner" />
          ) : item.status === "done" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : item.status === "stopped" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>
        <div className="exec-card-info">
          <div className="exec-card-title">
            {item.type === "script" ? "Script" : "Agent"}: {item.title}
          </div>
          <div className="exec-card-status">{item.statusText}</div>
        </div>
        {hasMenuItems && (
          <div className="exec-card-actions">
            <div className="task-menu-container" ref={menuRef}>
              <button
                className="task-menu-btn exec-card-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                title="More actions"
              >
                <IconMoreVertical />
              </button>
              {menuOpen && (
                <div className="task-menu-dropdown">
                  {hasLog && onViewLog && (
                    <button
                      className="task-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onViewLog();
                      }}
                    >
                      <IconTerminal />
                      <span>View Log</span>
                    </button>
                  )}
                  {item.command && onShowCommand && (
                    <button
                      className="task-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onShowCommand();
                      }}
                    >
                      <IconCode />
                      <span>Show Command</span>
                    </button>
                  )}
                  {isRunning && item.type === "script" && onRestartScript && (
                    <button
                      className="task-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onRestartScript();
                      }}
                    >
                      <IconRestart />
                      <span>Restart</span>
                    </button>
                  )}
                  {isFailed && onRetryTask && (
                    <button
                      className="task-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onRetryTask();
                      }}
                    >
                      <IconRetry />
                      <span>Retry</span>
                    </button>
                  )}
                  {isRunning && hasLog && onStopTask && (
                    <button
                      className="task-menu-item danger"
                      onClick={() => {
                        setMenuOpen(false);
                        onStopTask();
                      }}
                    >
                      <IconStop />
                      <span>Stop Task</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {item.timestamp && (
        <div className="exec-card-time">{item.timestamp}</div>
      )}
    </div>
  );
}
