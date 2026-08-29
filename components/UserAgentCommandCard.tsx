"use client";

import { IconTerminal } from "@/components/Icons";
import { handleCardDoubleClick } from "@/components/ExecCard";

export interface UserAgentCommandCardProps {
  title: string;
  statusText: string;
  timestamp?: string;
  userName?: string;
  userColor?: string;
}

/**
 * UserAgentCommandCard component represents a user-initiated agent command
 * in the session timeline. It differs from system or other execution cards by
 * having a distinct blue background and styling.
 */
export default function UserAgentCommandCard({
  title,
  statusText,
  timestamp,
  userName,
  userColor,
}: UserAgentCommandCardProps) {
  const displayName = userName || "User";
  const displayColor = userColor || "#6b7280";

  return (
    <div
      className="exec-card user-agent-command-card exec-card-success"
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
        <div className="exec-card-info">
          <div className="exec-card-title">
            AgentCommand: {title}
          </div>
          <div className="exec-card-status">{statusText}</div>
        </div>
      </div>
      {timestamp && (
        <div className="exec-card-time">{timestamp}</div>
      )}
    </div>
  );
}
