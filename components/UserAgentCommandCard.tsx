"use client";

import { IconTerminal } from "@/components/Icons";

export interface UserAgentCommandCardProps {
  title: string;
  statusText: string;
  timestamp?: string;
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
}: UserAgentCommandCardProps) {
  return (
    <div className="exec-card user-agent-command-card exec-card-success">
      <div className="exec-card-header">
        <div className="exec-card-icon">
          <IconTerminal />
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
