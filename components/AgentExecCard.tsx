"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

const LINE_HEIGHT = 20;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 300;
// Approximate terminal column width in px at fontSize 13
const COL_WIDTH = 8;
// Approximate terminal content width (card max-width minus card/terminal chrome)
const TERMINAL_COLS = 58;

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
  ws: WebSocket | null;
  onShowPrompt?: () => void;
}

function isWideChar(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2E80 && cp <= 0x303F) ||
    (cp >= 0x3040 && cp <= 0x33FF) ||
    (cp >= 0x3400 && cp <= 0x9FFF) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFF01 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6)
  );
}

function estimateHeight(log: string): number {
  const stripped = log.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
  let totalRows = 0;
  for (const line of stripped.split("\n")) {
    if (!line) continue;
    let cols = 0;
    for (const char of line) {
      cols += isWideChar(char.codePointAt(0) ?? 0) ? 2 : 1;
    }
    totalRows += Math.max(1, Math.ceil(cols / TERMINAL_COLS));
  }
  return Math.max(Math.min(totalRows * LINE_HEIGHT + 48, MAX_HEIGHT), MIN_HEIGHT);
}

export default function AgentExecCard({ sessionId, ws, onShowPrompt, ...props }: AgentExecCardProps) {
  const isLive = props.item.status === "running";
  const [outputHeight, setOutputHeight] = useState(MAX_HEIGHT);
  const [hasOutput, setHasOutput] = useState(false);

  useEffect(() => {
    if (!props.item.messageId) return;

    fetch(`/api/sessions/${sessionId}/log?messageId=${props.item.messageId}`)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) {
          setHasOutput(true);
          setOutputHeight(isLive ? MAX_HEIGHT : estimateHeight(log));
        }
      })
      .catch(() => {});
  }, [isLive, props.item.messageId, sessionId]);

  // For live tasks with no initial log, reveal the terminal on the first WebSocket output event
  useEffect(() => {
    if (!isLive || !ws || !props.item.messageId) return;

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "terminal:output" &&
          msg.sessionId === sessionId &&
          msg.messageId === props.item.messageId
        ) {
          setHasOutput(true);
          setOutputHeight(MAX_HEIGHT);
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [isLive, ws, sessionId, props.item.messageId]);

  return (
    <ExecCard
      {...props}
      extraMenuItems={onShowPrompt ? (closeMenu) => (
        <button
          className="task-menu-item"
          onClick={() => { closeMenu(); onShowPrompt(); }}
        >
          <IconFileText />
          <span>Show Prompt</span>
        </button>
      ) : undefined}
    >
      {props.item.messageId && hasOutput && (
        <div className="agent-exec-output" style={{ height: outputHeight }}>
          <Terminal
            sessionId={sessionId}
            messageId={props.item.messageId}
            ws={ws}
            mode={isLive ? "live" : "history"}
            taskType="agent"
          />
        </div>
      )}
    </ExecCard>
  );
}
