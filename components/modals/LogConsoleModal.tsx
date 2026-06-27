import dynamic from "next/dynamic";
import { IconX, IconPlay, IconBolt } from "@/components/Icons";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

interface Props {
  open: boolean;
  onClose: () => void;
  activeLogMsgId: string | null;
  isRunning: boolean;
  isScriptLog: boolean;
  selectedSessionId: string | null;
  ws: WebSocket | null;
}

export default function LogConsoleModal({
  open,
  onClose,
  activeLogMsgId,
  isRunning,
  isScriptLog,
  selectedSessionId,
  ws,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isScriptLog ? <IconPlay /> : <IconBolt />}
            {isScriptLog ? "Script Execution Log" : "Agent Execution Log"}
            {isRunning && (
              <span className="console-badge-running" style={{ marginLeft: 8 }}>
                ⟳ Streaming...
              </span>
            )}
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0, overflow: "hidden" }}>
          {activeLogMsgId && selectedSessionId ? (
            <Terminal
              sessionId={selectedSessionId}
              messageId={activeLogMsgId}
              ws={ws}
              mode={isRunning ? "live" : "history"}
              taskType={isScriptLog ? "script" : "agent"}
            />
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
