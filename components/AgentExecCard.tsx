"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkFileLinks, { extractCandidatePaths, candidateToPath } from "@/lib/remarkFileLinks";
import { resolveRepoFilePath } from "@/lib/homeUtils";
import ExecCard, { ExecCardProps } from "@/components/ExecCard";
import { IconTerminal, IconFileText, IconCopy } from "@/components/Icons";
import DiffModal from "@/components/modals/DiffModal";

// Terminal mode-control sequences (cursor visibility, mouse tracking, bracketed paste, etc.)
// leak into agent PTY output but carry no visual meaning outside a real terminal emulator.
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    // agy occasionally emits U+FFFD replacement characters when a multi-byte
    // UTF-8 sequence gets split across PTY output chunks; drop them rather
    // than render mojibake in the markdown output.
    .replace(/\uFFFD/g, "");
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
  const [pathInfos, setPathInfos] = useState<Record<string, { exists: boolean; diff?: string }>>({});
  const [diffsToSave, setDiffsToSave] = useState<Record<string, string>>({});
  const [hasVerified, setHasVerified] = useState(false);
  const [cachedHtml, setCachedHtml] = useState<string | null>(null);
  const [isHtmlLoaded, setIsHtmlLoaded] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  // Fetch cached HTML if exists
  useEffect(() => {
    if (!props.item.messageId || onViewLog) {
      setIsHtmlLoaded(true);
      return;
    }

    const url = sessionId
      ? `/api/sessions/${sessionId}/html?messageId=${props.item.messageId}`
      : `/api/sessions/global/html?messageId=${props.item.messageId}&projectId=${projectId || ""}`;

    fetch(url)
      .then((r) => r.json())
      .then(({ html }: { html?: string }) => {
        if (html) {
          setCachedHtml(html);
        }
        setIsHtmlLoaded(true);
      })
      .catch(() => {
        setIsHtmlLoaded(true);
      });
  }, [props.item.messageId, sessionId, projectId, onViewLog]);

  // Fetch log only if html cache doesn't exist and not live, or if it is live
  useEffect(() => {
    if (!props.item.messageId || onViewLog) return;
    if (cachedHtml && !isLive) return;

    const url = sessionId
      ? `/api/sessions/${sessionId}/log?messageId=${props.item.messageId}`
      : `/api/sessions/global/log?messageId=${props.item.messageId}&projectId=${projectId || ""}`;

    fetch(url)
      .then((r) => r.json())
      .then(({ log }: { log: string }) => {
        if (log) setLog(stripAnsi(log));
      })
      .catch(() => {});
  }, [props.item.messageId, sessionId, projectId, onViewLog, cachedHtml, isLive]);

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

  // Reset verification and cache states if the task goes live (e.g. on retry)
  useEffect(() => {
    if (isLive) {
      setHasVerified(false);
      setCachedHtml(null);
      setPathInfos({});
      setDiffsToSave({});
    }
  }, [isLive]);

  // Keep the view pinned to the latest output while it's streaming
  useEffect(() => {
    if (!isLive || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log, isLive]);

  // Verify paths once the agent execution completes (isLive becomes false)
  useEffect(() => {
    if (isLive || !repoPath || !runnerId || !log || hasVerified || cachedHtml) return;

    const candidates = extractCandidatePaths(log);
    if (candidates.length === 0) {
      setHasVerified(true);
      return;
    }

    const absPaths = candidates.map((c) => {
      const path = candidateToPath(c);
      const decoded = decodeURIComponent(path);
      return decoded.startsWith("/") ? decoded : resolveRepoFilePath(repoPath, decoded);
    });

    fetch("/api/fs/infos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runner: runnerId, paths: absPaths }),
    })
      .then((r) => r.json())
      .then(({ results }: { results?: Record<string, { exists: boolean; diff?: string }> }) => {
        if (!results) {
          setHasVerified(true);
          return;
        }
        const infos: Record<string, { exists: boolean; diff?: string }> = {};
        const diffMap: Record<string, string> = {};
        candidates.forEach((c, i) => {
          const res = results[absPaths[i]];
          if (res && res.exists) {
            const cleanPath = candidateToPath(c);
            const infoObj = {
              exists: true,
              diff: res.diff,
            };
            infos[cleanPath] = infoObj;
            infos[c] = infoObj;
            if (res.diff) {
              diffMap[absPaths[i]] = res.diff;
            }
          }
        });
        setPathInfos(infos);
        setDiffsToSave(diffMap);
        setHasVerified(true);
      })
      .catch(() => {
        setHasVerified(true);
      });
  }, [isLive, log, repoPath, runnerId, hasVerified, cachedHtml]);

  // Save HTML cache once verification is completed and DOM is rendered
  useEffect(() => {
    if (isLive || !hasVerified || cachedHtml || !outputRef.current) return;

    const timer = setTimeout(() => {
      if (!outputRef.current) return;
      const html = outputRef.current.innerHTML;
      if (!html) return;

      const url = sessionId
        ? `/api/sessions/${sessionId}/html?messageId=${props.item.messageId}`
        : `/api/sessions/global/html?messageId=${props.item.messageId}&projectId=${projectId || ""}`;

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, diffs: diffsToSave }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            setCachedHtml(html);
          }
        })
        .catch(() => {});
    }, 100);

    return () => clearTimeout(timer);
  }, [isLive, hasVerified, cachedHtml, sessionId, props.item.messageId, projectId, diffsToSave]);

  const handleOutputClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const fileBtn = target.closest(".agent-filelink-btn, .agent-filelink-view-btn");
    if (fileBtn) {
      const path = fileBtn.getAttribute("data-path");
      if (path && onOpenFilePath) {
        onOpenFilePath(decodeURIComponent(path));
      }
      return;
    }

    const diffBtn = target.closest(".agent-filelink-diff-btn");
    if (diffBtn) {
      const path = diffBtn.getAttribute("data-path");
      if (path) {
        const absPath = path.startsWith("/") ? path : (repoPath ? resolveRepoFilePath(repoPath, path) : path);
        setSelectedDiffPath(decodeURIComponent(absPath));
        setDiffModalOpen(true);
      }
    }
  };

  const verifiedPaths = new Set(
    Object.entries(pathInfos)
      .filter(([_, info]) => info.exists)
      .map(([path]) => path)
  );

  const hasLog = !!props.item.messageId;
  const canCopy = !onViewLog && hasLog && !!log;

  const copyRaw = () => navigator.clipboard.writeText(log).catch(() => {});
  const copyRendered = () => {
    const text = outputRef.current?.innerText ?? log;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const extraMenuItems = (onShowPrompt || (hasLog && onViewLog) || canCopy)
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
          {canCopy && (
            <button
              className="task-menu-item"
              onClick={() => { closeMenu(); copyRendered(); }}
            >
              <IconCopy />
              <span>Copy Output</span>
            </button>
          )}
          {canCopy && (
            <button
              className="task-menu-item"
              onClick={() => { closeMenu(); copyRaw(); }}
            >
              <IconCopy />
              <span>Copy Raw Output</span>
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
    <>
      <ExecCard
        {...props}
        extraMenuItems={extraMenuItems}
      >
        {!onViewLog && props.item.messageId && cachedHtml && (
          <div 
            ref={outputRef} 
            className="agent-exec-output"
            onClick={handleOutputClick}
            dangerouslySetInnerHTML={{ __html: cachedHtml }}
          />
        )}
        {!onViewLog && props.item.messageId && !cachedHtml && log && (
          <div 
            ref={outputRef} 
            className="agent-exec-output"
            onClick={handleOutputClick}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, [remarkFileLinks, { verified: verifiedPaths }]]}
              rehypePlugins={[rehypeHighlight]}
              urlTransform={(url) => url}
              components={{
                a: ({ href, children, ...rest }) => {
                  if (href?.startsWith("filelink:")) {
                    const path = href.slice("filelink:".length);
                    const info = pathInfos[path];
                    const hasDiff = !!info?.diff;

                    if (hasDiff) {
                      return (
                        <span className="agent-filelink-wrapper" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            className="agent-filelink-btn"
                            data-path={path}
                          >
                            {children}
                          </button>
                          <button
                            type="button"
                            className="agent-filelink-diff-btn"
                            data-path={path}
                            title="Show Diff"
                            aria-label="Show Diff"
                          />
                        </span>
                      );
                    }

                    return (
                      <button
                        type="button"
                        className="agent-filelink-btn"
                        data-path={path}
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
      <DiffModal
        open={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        sessionId={sessionId}
        messageId={props.item.messageId}
        filePath={selectedDiffPath}
        projectId={projectId}
      />
    </>
  );
}

