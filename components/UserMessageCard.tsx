"use client";

import { useEffect, useRef, useState } from "react";
import { IconMoreVertical, IconCopy } from "@/components/Icons";

export interface UserMessageCardProps {
  content: string;
  timestamp?: string;
  renderContent?: (content: string) => React.ReactNode;
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
}: UserMessageCardProps) {
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

  return (
    <div className="exec-card user-message-card">
      <div className="exec-card-header">
        <div className="exec-card-info user-message-card-content">
          {renderContent ? renderContent(content) : content}
        </div>
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
