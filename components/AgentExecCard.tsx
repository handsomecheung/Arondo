"use client";

import { useState, useEffect, useRef } from "react";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal } from "@/components/Icons";

// Terminal mode-control sequences (cursor visibility, mouse tracking, bracketed paste, etc.)
// leak into agent PTY output but carry no visual meaning outside a real terminal emulator.
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

function IconFileText() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

interface AgentExecCardProps extends ExecCardProps {
  sessionId: string;
  projectId?: string;
  ws: WebSocket | null;
  onShowPrompt?: () => void;
  onViewLog?: () => void;
}

export default function AgentExecCard({ sessionId, projectId, ws, onShowPrompt, onViewLog, ...props }: AgentExecCardProps) {
  const isLive = props.item.status === "running";
  const [log, setLog] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!props.item.messageId) return;

    // If onViewLog is provided (Task page), we don't display output inline,
    // so we can also skip fetching the log inline to save bandwidth.
    if (onViewLog) return;

    const url = sessionId
      ? `/api/sessions/${sessionId}/log?messageId=${props.item.messageId}`
      : `/api/sessions/global/log?messageId=${props.item.messageId}&projectId=${projectId || ""}`;

    fetch(url)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) setLog(stripAnsi(log));
      })
      .catch(() => {});
  }, [props.item.messageId, sessionId, projectId, onViewLog]);

  // Live tasks: append streamed output as it arrives over the WebSocket
  useEffect(() => {
    if (!isLive || !ws || !props.item.messageId || onViewLog) return;

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "terminal:output" &&
          msg.sessionId === (sessionId || "") &&
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
  }, [isLive, ws, sessionId, props.item.messageId, onViewLog]);

  // Keep the view pinned to the latest output while it's streaming
  useEffect(() => {
    if (!isLive || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log, isLive]);

  const hasLog = !!props.item.messageId;
  const extraMenuItems = (onShowPrompt || (hasLog && onViewLog))
    ? (closeMenu: () => void) => (
        <>
          {hasLog && onViewLog && (
            <button
              className="task-menu-item"
              onClick={() => { closeMenu(); onViewLog(); }}
            >
              <IconTerminal />
              <span>Show Log</span>
            </button>
          )}
          {onShowPrompt && (
            <button
              className="task-menu-item"
              onClick={() => { closeMenu(); onShowPrompt(); }}
            >
              <IconFileText />
              <span>Show Prompt</span>
            </button>
          )}
        </>
      )
    : undefined;

  return (
    <ExecCard
      {...props}
      extraMenuItems={extraMenuItems}
    >
      {!onViewLog && props.item.messageId && log && (
        <pre ref={outputRef} className="agent-exec-output">
          {log}
        </pre>
      )}
    </ExecCard>
  );
}

