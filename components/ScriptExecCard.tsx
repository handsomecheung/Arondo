"use client";

import { useState, useEffect, useRef } from "react";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal, IconAntigravity } from "@/components/Icons";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

interface ScriptExecCardProps extends ExecCardProps {
  onViewLog?: () => void;
  onAnalyze?: (message: string) => void | Promise<void>;
  sessionId?: string;
  projectId?: string;
  ws?: WebSocket | null;
  showLogInline?: boolean;
}

export default function ScriptExecCard({
  onViewLog,
  onAnalyze,
  sessionId,
  projectId,
  ws,
  showLogInline = true,
  ...props
}: ScriptExecCardProps) {
  const hasLog = !!props.item.messageId;
  const isRunning = props.item.status === "running";
  const [log, setLog] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);

  const isGlobal = !sessionId && !!projectId;
  const logSessionId = isGlobal ? "global" : sessionId;
  const hasLogSource = !!props.item.messageId && (!!sessionId || isGlobal);

  // Initial fetch of logs
  useEffect(() => {
    if (!showLogInline || !props.item.messageId || !logSessionId) return;
    const url = isGlobal
      ? `/api/sessions/global/log?messageId=${props.item.messageId}&projectId=${projectId}`
      : `/api/sessions/${logSessionId}/log?messageId=${props.item.messageId}`;
    fetch(url)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) setLog(stripAnsi(log));
      })
      .catch(() => {});
  }, [showLogInline, props.item.messageId, logSessionId, isGlobal, projectId]);

  // Stream logs over WS
  useEffect(() => {
    if (!showLogInline || !isRunning || !ws || !props.item.messageId || !hasLogSource) return;

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "terminal:output" &&
          msg.sessionId === (sessionId ?? "") &&
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
  }, [showLogInline, isRunning, ws, sessionId, props.item.messageId, hasLogSource]);

  // Auto scroll to bottom
  useEffect(() => {
    if (!showLogInline || !isRunning || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log, isRunning, showLogInline]);

  const MAX_OUTPUT_CHARS = 5_000;

  const handleAnalyze = async () => {
    let logContent = log;
    if (!logContent && props.item.messageId && logSessionId) {
      const url = isGlobal
        ? `/api/sessions/global/log?messageId=${props.item.messageId}&projectId=${projectId}`
        : `/api/sessions/${logSessionId}/log?messageId=${props.item.messageId}`;
      try {
        const r = await fetch(url);
        const data = await r.json();
        if (data.log) logContent = stripAnsi(data.log);
      } catch {
        /* ignore */
      }
    }

    let resultStatus = "";
    if (props.item.status === "done") {
      resultStatus = "\nStatus: Succeeded";
    } else if (props.item.status === "error") {
      resultStatus = "\nStatus: Failed";
    }

    let formattedLog = logContent ? logContent.trim() : "(No output)";
    if (formattedLog.length > MAX_OUTPUT_CHARS) {
      formattedLog = `[Earlier output truncated. Showing the last ${MAX_OUTPUT_CHARS.toLocaleString()} characters:]\n\n${formattedLog.slice(-MAX_OUTPUT_CHARS)}`;
    }

    const scriptLabel = props.item.command || props.item.title || "script";
    const message = `Please analyze the execution result of the following script:\n\nCommand: \`${scriptLabel}\`${resultStatus}\n\nOutput:\n\`\`\`\n${formattedLog}\n\`\`\``;

    if (onAnalyze) {
      onAnalyze(message);
    } else if (sessionId) {
      try {
        await fetch(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, prompt: message, type: "chat-user" }),
        });
      } catch {
        /* ignore */
      }
    }
  };

  const canAnalyze = hasLog && (!!onAnalyze || !!sessionId);

  const extraMenuItems = (hasLog && onViewLog) || canAnalyze
    ? (closeMenu: () => void) => (
      <>
        {hasLog && onViewLog && (
          <button className="task-menu-item" onClick={() => { closeMenu(); onViewLog(); }}>
            <IconTerminal />
            <span>Open Terminal</span>
          </button>
        )}
        {canAnalyze && (
          <button className="task-menu-item" onClick={() => { closeMenu(); handleAnalyze(); }}>
            <IconAntigravity />
            <span>Analyze with Agent</span>
          </button>
        )}
      </>
    )
    : undefined;

  const className = `script-exec-card ${props.className || ""}`;

  return (
    <ExecCard {...props} extraMenuItems={extraMenuItems} className={className}>
      {showLogInline && hasLogSource && (
        <pre ref={outputRef} className="agent-exec-output" style={{ maxHeight: "250px" }}>
          {log || "Running command..."}
        </pre>
      )}
    </ExecCard>
  );
}
