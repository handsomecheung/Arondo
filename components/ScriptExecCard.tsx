"use client";

import { useState, useEffect, useRef } from "react";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal } from "@/components/Icons";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

interface ScriptExecCardProps extends ExecCardProps {
  onViewLog?: () => void;
  sessionId?: string;
  ws?: WebSocket | null;
  showLogInline?: boolean;
}

export default function ScriptExecCard({
  onViewLog,
  sessionId,
  ws,
  showLogInline = false,
  ...props
}: ScriptExecCardProps) {
  const hasLog = !!props.item.messageId;
  const isRunning = props.item.status === "running";
  const [log, setLog] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);

  // Initial fetch of logs
  useEffect(() => {
    if (!showLogInline || !props.item.messageId || !sessionId) return;
    const url = `/api/sessions/${sessionId}/log?messageId=${props.item.messageId}`;
    fetch(url)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) setLog(stripAnsi(log));
      })
      .catch(() => {});
  }, [showLogInline, props.item.messageId, sessionId]);

  // Stream logs over WS
  useEffect(() => {
    if (!showLogInline || !isRunning || !ws || !props.item.messageId || !sessionId) return;

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "terminal:output" &&
          msg.sessionId === sessionId &&
          msg.messageId === props.item.messageId
        ) {
          setLog((prev) => prev + stripAnsi(msg.data));
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [showLogInline, isRunning, ws, sessionId, props.item.messageId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (!showLogInline || !isRunning || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log, isRunning, showLogInline]);

  const extraMenuItems = hasLog && onViewLog
    ? (closeMenu: () => void) => (
      <button className="task-menu-item" onClick={() => { closeMenu(); onViewLog(); }}>
        <IconTerminal />
        <span>View Log</span>
      </button>
    )
    : undefined;

  const className = `script-exec-card ${props.className || ""}`;

  return (
    <ExecCard {...props} extraMenuItems={extraMenuItems} className={className}>
      {showLogInline && props.item.messageId && (
        <pre ref={outputRef} className="agent-exec-output" style={{ maxHeight: "250px" }}>
          {log || "Running command..."}
        </pre>
      )}
    </ExecCard>
  );
}

