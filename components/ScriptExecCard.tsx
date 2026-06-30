"use client";

import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal } from "@/components/Icons";

interface ScriptExecCardProps extends ExecCardProps {
  onViewLog?: () => void;
}

export default function ScriptExecCard({ onViewLog, ...props }: ScriptExecCardProps) {
  const hasLog = !!props.item.messageId;
  const extraMenuItems = hasLog && onViewLog
    ? (closeMenu: () => void) => (
      <button className="task-menu-item" onClick={() => { closeMenu(); onViewLog(); }}>
        <IconTerminal />
        <span>View Log</span>
      </button>
    )
    : undefined;

  return <ExecCard {...props} extraMenuItems={extraMenuItems} />;
}
