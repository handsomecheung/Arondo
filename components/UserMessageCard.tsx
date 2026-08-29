"use client";

import { useEffect, useRef, useState } from "react";
import { IconMoreVertical, IconCopy } from "@/components/Icons";
import { useTaskMenuPlacement } from "@/components/useTaskMenuPlacement";
import { handleCardDoubleClick } from "@/components/ExecCard";

export interface UserMessageCardProps {
  content: string;
  timestamp?: string;
  renderContent?: (content: string) => React.ReactNode;
  userName?: string;
  userColor?: string;
}

/**
 * UserMessageCard represents a plain user chat message in the session
 * timeline, styled like UserAgentCommandCard (light purple background) so
 * user-authored entries are visually distinct from agent/system output.
 */
export default function UserMessageCard({
  content,
  timestamp,
  renderContent,
  userName,
  userColor,
}: UserMessageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { opensUpward, maxHeight } = useTaskMenuPlacement(menuOpen, menuRef, dropdownRef);

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

  const displayName = userName || "User";
  const displayColor = userColor || "#6b7280";

  return (
    <div
      className="exec-card user-message-card"
      onDoubleClick={handleCardDoubleClick}
    >
      <div className="exec-card-header">
        <div
          title={displayName}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: displayColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            textTransform: "uppercase",
          }}
        >
          {displayName.charAt(0) || "?"}
        </div>
        <div className="exec-card-info user-message-card-content">
          {renderContent ? renderContent(content) : content}
        </div>
        <div className="exec-card-actions">
          <div className="task-menu-container" ref={menuRef}>
            <button
              className="task-menu-btn exec-card-menu-btn"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title="More actions"
            >
              <IconMoreVertical />
            </button>
            {menuOpen && (
              <div
                className={`task-menu-dropdown${opensUpward ? " task-menu-dropdown-upward" : ""}`}
                ref={dropdownRef}
                style={maxHeight ? { maxHeight } : undefined}
              >
                <button
                  className="task-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard.writeText(content);
                  }}
                >
                  <IconCopy />
                  <span>Copy</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {timestamp && <div className="exec-card-time">{timestamp}</div>}
    </div>
  );
}
