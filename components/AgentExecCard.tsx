"use client";

import { useState, useEffect, useRef } from "react";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal, IconFileText } from "@/components/Icons";

// Terminal mode-control sequences (cursor visibility, mouse tracking, bracketed paste, etc.)
// leak into agent PTY output but carry no visual meaning outside a real terminal emulator.
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
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

