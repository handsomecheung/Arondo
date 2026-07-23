"use client";

import { useEffect, useRef, useState } from "react";
import { IconMoreVertical, IconSend, IconX, IconClock } from "@/components/Icons";
import type { TodoTrigger, TodoTriggerKind } from "@/types/home";

export interface UserTodoMessageCardProps {
  content: string;
  timestamp?: string;
  trigger?: TodoTrigger;
  status?: string;
  renderContent?: (content: string) => React.ReactNode;
  onCancel: () => void;
  onSendNow: () => void;
  onChangeTrigger: (trigger: TodoTrigger) => void;
}

const TRIGGER_OPTIONS: { kind: TodoTriggerKind; label: string; title: string }[] = [
  { kind: "manual", label: "Manually", title: "Send only when I choose" },
  { kind: "codebaseReady", label: "Automatically", title: "Send automatically once no agent is running and the codebase is clean" },
];

function describeTrigger(trigger?: TodoTrigger): string {
  if (!trigger) return "";
  switch (trigger.kind) {
    case "manual":
      return "⏸ Manual — send when ready";
    case "codebaseReady":
      return "⏳ Waiting: codebase ready";
    case "afterSession":
      return "⏳ Waiting for the current run to finish";
    case "quotaAvailable":
      return "⏳ Waiting for quota to free up";
    case "at":
      return trigger.timestamp
        ? `🕒 Scheduled for ${new Date(trigger.timestamp).toLocaleString()}`
        : "🕒 Scheduled";
    default:
      return "";
  }
}

/**
 * UserTodoMessageCard represents a chat message that hasn't been dispatched
 * yet (draft, pending-on-codebase-ready, queued behind a running agent, or
 * waiting for quota) — unified representation for all four "send later"
 * flows, replacing the old scheduled-tasks.json + Session.status="draft".
 */
export default function UserTodoMessageCard({
  content,
  timestamp,
  trigger,
  status,
  renderContent,
  onCancel,
  onSendNow,
  onChangeTrigger,
}: UserTodoMessageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setTriggerPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isPending = !status || status === "pending";

  return (
    <div className="exec-card user-message-card user-todo-message-card">
      <div className="exec-card-header">
        <div className="exec-card-info user-message-card-content">
          {renderContent ? renderContent(content) : content}
        </div>
        {isPending && (
          <div className="exec-card-actions">
            <div className="task-menu-container" ref={menuRef}>
              <button
                className="task-menu-btn exec-card-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                  setTriggerPickerOpen(false);
                }}
                title="More actions"
              >
                <IconMoreVertical />
              </button>
              {menuOpen && !triggerPickerOpen && (
                <div className="task-menu-dropdown">
                  <button
                    className="task-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onSendNow();
                    }}
                  >
                    <IconSend />
                    <span>Send Now</span>
                  </button>
                  <button className="task-menu-item" onClick={() => setTriggerPickerOpen(true)}>
                    <IconClock />
                    <span>Change Trigger</span>
                  </button>
                  <button
                    className="task-menu-item danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onCancel();
                    }}
                  >
                    <IconX />
                    <span>Cancel</span>
                  </button>
                </div>
              )}
              {menuOpen && triggerPickerOpen && (
                <div className="task-menu-dropdown">
                  {TRIGGER_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      className="task-menu-item"
                      disabled={trigger?.kind === opt.kind}
                      title={opt.title}
                      onClick={() => {
                        setMenuOpen(false);
                        setTriggerPickerOpen(false);
                        onChangeTrigger({ kind: opt.kind });
                      }}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="exec-card-status">{describeTrigger(trigger)}</div>
      {timestamp && <div className="exec-card-time">{timestamp}</div>}
    </div>
  );
}
