"use client";

import { useState, useEffect, useRef } from "react";
import { execCardInfoToItem, ExecCardInfo } from "@/lib/homeUtils";
import { IconTerminal } from "@/components/Icons";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

interface UserScriptQuickCardProps {
  cardInfo: ExecCardInfo;
  sessionId: string;
  ws: WebSocket | null;
  onViewLog?: () => void;
}

export default function UserScriptQuickCard({ cardInfo, sessionId, ws, onViewLog }: UserScriptQuickCardProps) {
  const item = execCardInfoToItem(cardInfo);
  const isRunning = item.status === "running";
  const [log, setLog] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);

  // Initial fetch of logs
  useEffect(() => {
    if (!item.messageId) return;
    const url = `/api/sessions/${sessionId}/log?messageId=${item.messageId}`;
    fetch(url)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) setLog(stripAnsi(log));
      })
      .catch(() => {});
  }, [item.messageId, sessionId]);

  // Stream logs over WS
  useEffect(() => {
    if (!isRunning || !ws || !item.messageId) return;

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "terminal:output" &&
          msg.sessionId === sessionId &&
          msg.messageId === item.messageId
        ) {
          setLog((prev) => prev + stripAnsi(msg.data));
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [isRunning, ws, sessionId, item.messageId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (!isRunning || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log, isRunning]);

  let statusClass = "exec-card-running";
  if (!isRunning) {
    if (item.status === "done") statusClass = "exec-card-success";
    else if (item.status === "stopped") statusClass = "exec-card-stopped";
    else statusClass = "exec-card-error";
  }

  return (
    <div className={`exec-card ${statusClass} user-script-quick-card`}>
      <div className="exec-card-header">
        <div className="exec-card-icon">
          {isRunning ? (
            <span className="exec-card-spinner" />
          ) : (
            <IconTerminal />
          )}
        </div>
        <div className="exec-card-info">
          <div className="exec-card-title">
            Command: {cardInfo.prompt || item.title}
          </div>
          <div className="exec-card-status">{item.statusText}</div>
        </div>
        {item.timestamp && (
          <div className="exec-card-time" style={{ padding: 0, margin: 0 }}>
            {item.timestamp}
          </div>
        )}
        {item.messageId && isRunning && onViewLog && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewLog();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.borderColor = "var(--border-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <IconTerminal />
            <span>Terminal</span>
          </button>
        )}
      </div>

      {item.messageId && (
        <pre ref={outputRef} className="agent-exec-output" style={{ maxHeight: "250px" }}>
          {log || "Running command..."}
        </pre>
      )}
    </div>
  );
}
