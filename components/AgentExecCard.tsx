"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkFileLinks, { extractCandidatePaths, candidateToPath } from "@/lib/remarkFileLinks";
import { resolveRepoFilePath } from "@/lib/homeUtils";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal, IconFileText, IconCode } from "@/components/Icons";

// Terminal mode-control sequences (cursor visibility, mouse tracking, bracketed paste, etc.)
// leak into agent PTY output but carry no visual meaning outside a real terminal emulator.
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    // agy occasionally emits U+FFFD replacement characters when a multi-byte
    // UTF-8 sequence gets split across PTY output chunks; drop them rather
    // than render mojibake in the markdown output.
    .replace(/�/g, "");
}


interface AgentExecCardProps extends ExecCardProps {
  sessionId: string;
  projectId?: string;
  ws: WebSocket | null;
  repoPath?: string;
  runnerId?: string;
  onShowPrompt?: () => void;
  onViewLog?: () => void;
  onOpenFilePath?: (path: string) => void;
}

export default function AgentExecCard({ sessionId, projectId, ws, repoPath, runnerId, onShowPrompt, onViewLog, onOpenFilePath, ...props }: AgentExecCardProps) {
  const isLive = props.item.status === "running";
  const [log, setLog] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [verifiedPaths, setVerifiedPaths] = useState<Set<string>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null);


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

  // Only linkify paths that actually exist on the runner's filesystem.
  // Debounced so live-streaming output doesn't fire a check per chunk.
  useEffect(() => {
    if (!repoPath || !runnerId || !log) return;

    const candidates = extractCandidatePaths(log);
    if (candidates.length === 0) return;

    const timer = setTimeout(() => {
      const absPaths = candidates.map((c) => {
        const path = candidateToPath(c);
        return path.startsWith("/") ? path : resolveRepoFilePath(repoPath, path);
      });
      fetch("/api/fs/exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runner: runnerId, paths: absPaths }),
      })
        .then((r) => r.json())
        .then(({ results }: { results?: Record<string, boolean> }) => {
          if (!results) return;
          const verified = new Set<string>();
          candidates.forEach((c, i) => {
            if (results[absPaths[i]]) verified.add(c);
          });
          setVerifiedPaths(verified);
        })
        .catch(() => {});
    }, 600);

    return () => clearTimeout(timer);
  }, [log, repoPath, runnerId]);

  const hasLog = !!props.item.messageId;
  const canToggleRaw = !onViewLog && hasLog && !!log;
  const extraMenuItems = (onShowPrompt || (hasLog && onViewLog) || canToggleRaw)
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
          {canToggleRaw && (
            <button
              className="task-menu-item"
              onClick={() => { closeMenu(); setShowRaw((v) => !v); }}
            >
              <IconCode />
              <span>{showRaw ? "Show HTML" : "Show Raw Output"}</span>
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
      {!onViewLog && props.item.messageId && log && showRaw && (
        <div ref={outputRef} className="agent-exec-output agent-exec-output-raw">
          <pre>{log}</pre>
        </div>
      )}
      {!onViewLog && props.item.messageId && log && !showRaw && (
        <div ref={outputRef} className="agent-exec-output">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkFileLinks, { verified: verifiedPaths }]]}
            rehypePlugins={[rehypeHighlight]}
            urlTransform={(url) => url}
            components={{
              a: ({ href, children, ...rest }) => {
                if (href?.startsWith("filelink:")) {
                  const path = href.slice("filelink:".length);
                  return (
                    <button
                      type="button"
                      className="agent-filelink-btn"
                      onClick={() => onOpenFilePath?.(path)}
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {log}
          </ReactMarkdown>
        </div>
      )}
    </ExecCard>
  );
}

