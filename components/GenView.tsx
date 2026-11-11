"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import UserMessageCard from "@/components/UserMessageCard";
import { IconSend, IconStop, IconTerminal } from "@/components/Icons";
import { agentTypeLabel, autoResizeTextarea, formatTime } from "@/lib/homeUtils";
import type { GenMessage, GenSubAgentRunInfo } from "@/lib/gen/store";

interface Props {
  ws: WebSocket | null;
  onViewSubAgentLog: (subSessionId: string, messageId: string, isRunning: boolean) => void;
}

function formatShortSubSessionId(subSessionId: string): string {
  return subSessionId.replace(/^gen-sub-/, "").slice(0, 8);
}

export default function GenView({ ws, onViewSubAgentLog }: Props) {
  const [messages, setMessages] = useState<GenMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchGenState = useCallback(async () => {
    try {
      const res = await fetch("/api/gen");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("[GenView] failed to load messages:", err);
    }
  }, []);

  useEffect(() => {
    fetchGenState();
  }, [fetchGenState]);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as { type: string; payload?: any };
        if (event.type === "gen:updated") {
          fetchGenState();
        }
      } catch {
        // Ignore non-JSON ws frames
      }
    };
    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws, fetchGenState]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setSending(true);

    const optimisticUserMsg: GenMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await fetch("/api/gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.ok) {
        await fetchGenState();
      }
    } catch (err) {
      console.error("[GenView] failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleStopSubAgent = async (subAgent: GenSubAgentRunInfo) => {
    if (!subAgent.messageId) return;
    try {
      await fetch("/api/tasks/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: subAgent.subSessionId,
          messageId: subAgent.messageId,
        }),
      });
      await fetchGenState();
    } catch (err) {
      console.error("[GenView] failed to stop sub-agent:", err);
    }
  };

  const activeSubAgent = [...messages]
    .reverse()
    .find((m) => m.subAgent?.status === "running")?.subAgent;

  return (
    <div className="gen-view">
      <div className="gen-experimental-bar" id="gen-experimental-banner">
        <span className="gen-experimental-pill">Experimental · In Development</span>
        <span className="gen-experimental-text">
          Gen is an experimental Main Agent preview under active development.
        </span>
      </div>

      {activeSubAgent && (
        <div className="gen-status-banner" id="gen-active-subagent-banner">
          <div className="gen-status-banner-left">
            <span className="gen-status-pulse" />
            <span className="gen-status-title">
              Sub Agent running:{" "}
              <strong>{agentTypeLabel(activeSubAgent.agentType)}</strong>
              {activeSubAgent.model ? ` · ${activeSubAgent.model}` : ""}
              {activeSubAgent.effort ? ` (${activeSubAgent.effort})` : ""}
            </span>
            <span
              className={`gen-subagent-session-badge ${
                activeSubAgent.isContinuedSession || (activeSubAgent.turnNumber ?? 1) > 1
                  ? "continued"
                  : ""
              }`}
            >
              {activeSubAgent.isContinuedSession || (activeSubAgent.turnNumber ?? 1) > 1
                ? `↻ Session #${formatShortSubSessionId(activeSubAgent.subSessionId)} · Turn #${activeSubAgent.turnNumber ?? 2}`
                : `Session #${formatShortSubSessionId(activeSubAgent.subSessionId)} · Turn #1`}
            </span>
            <span className="gen-status-meta">
              {activeSubAgent.noProject || !activeSubAgent.repoPath
                ? "No Project"
                : activeSubAgent.repoPath.split("/").filter(Boolean).pop() || activeSubAgent.repoPath}
              {activeSubAgent.runnerName ? ` @ ${activeSubAgent.runnerName}` : ""}
            </span>
          </div>
          <div className="gen-status-banner-actions">
            {activeSubAgent.messageId && (
              <button
                type="button"
                className="gen-subagent-btn"
                onClick={() =>
                  onViewSubAgentLog(activeSubAgent.subSessionId, activeSubAgent.messageId!, true)
                }
              >
                <IconTerminal size={13} /> Log
              </button>
            )}
            {activeSubAgent.messageId && (
              <button
                type="button"
                className="gen-subagent-btn danger"
                onClick={() => handleStopSubAgent(activeSubAgent)}
              >
                <IconStop size={13} /> Stop
              </button>
            )}
          </div>
        </div>
      )}

      <div className="chat-area" id="gen-chat-area">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✨</div>
            <div className="empty-title" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span>Gen</span>
              <span className="gen-experimental-pill">Experimental</span>
            </div>
            <div className="empty-desc">
              Tell Gen what you want to build, fix, or investigate. Gen will automatically infer the project, choose the optimal sub-agent &amp; model, and report back when done.
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <UserMessageCard
                  key={msg.id}
                  content={msg.content}
                  timestamp={formatTime(msg.createdAt)}
                  renderContent={(c) => c}
                  userName={msg.userName}
                  userColor={msg.userColor}
                  sessionId="gen"
                />
              );
            }

            const sub = msg.subAgent;
            const projectLabel = sub
              ? sub.noProject || !sub.repoPath
                ? "No Project"
                : sub.repoPath.split("/").filter(Boolean).pop() || sub.repoPath
              : "";
            const turnNumber = sub ? (sub.turnNumber ?? 1) : 1;
            const isContinued = Boolean(sub && (sub.isContinuedSession || turnNumber > 1));
            const shortSessionId = sub ? formatShortSubSessionId(sub.subSessionId) : "";

            return (
              <div key={msg.id} className="message agent gen-message">
                <div className="message-avatar gen-avatar">Gen</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="message-bubble markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {msg.content}
                    </ReactMarkdown>

                    {sub && (
                      <div
                        className={`gen-subagent-card ${sub.status}`}
                        data-sub-session-id={sub.subSessionId}
                        data-turn-number={turnNumber}
                      >
                        <div className="gen-subagent-card-header">
                          <div className="gen-subagent-card-badges">
                            <span className={`gen-subagent-badge ${sub.status}`}>
                              {sub.status === "running"
                                ? "● Running"
                                : sub.status === "done"
                                  ? "✓ Completed"
                                  : sub.status === "stopped"
                                    ? "■ Stopped"
                                    : "✕ Failed"}
                            </span>
                            <span
                              className={`gen-subagent-session-badge ${isContinued ? "continued" : ""}`}
                              title={`Sub-Agent Session ID: ${sub.subSessionId}`}
                            >
                              {isContinued
                                ? `↻ Session #${shortSessionId} · Turn #${turnNumber} (Continued)`
                                : `Session #${shortSessionId} · Turn #${turnNumber}`}
                            </span>
                          </div>
                          <span className="gen-subagent-agent">
                            {agentTypeLabel(sub.agentType)}
                            {sub.model ? ` · ${sub.model}` : ""}
                            {sub.effort ? ` (${sub.effort})` : ""}
                          </span>
                        </div>
                        <div className="gen-subagent-card-meta">
                          <span>
                            Project: <strong>{projectLabel}</strong>
                            {sub.repoPath && !sub.noProject ? ` (${sub.repoPath})` : ""}
                          </span>
                          {sub.runnerName && (
                            <span>
                              Runner: <strong>{sub.runnerName}</strong>
                            </span>
                          )}
                          <span>
                            Session: <strong>#{shortSessionId}</strong>
                            {isContinued ? ` (Continued · Call #${turnNumber})` : ` (Call #${turnNumber})`}
                          </span>
                        </div>
                        {sub.messageId && (
                          <div className="gen-subagent-card-actions">
                            <button
                              type="button"
                              className="gen-subagent-btn"
                              onClick={() =>
                                onViewSubAgentLog(
                                  sub.subSessionId,
                                  sub.messageId!,
                                  sub.status === "running",
                                )
                              }
                            >
                              <IconTerminal size={13} /> View Log
                            </button>
                            {sub.status === "running" && (
                              <button
                                type="button"
                                className="gen-subagent-btn danger"
                                onClick={() => handleStopSubAgent(sub)}
                              >
                                <IconStop size={13} /> Stop
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="message-time">{formatTime(msg.createdAt)}</div>
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div className="message agent gen-message">
            <div className="message-avatar gen-avatar">Gen</div>
            <div>
              <div className="message-bubble">Thinking…</div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      <div className="input-area">
        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Message Gen..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResizeTextarea(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const next = input.slice(0, start) + "\n" + input.slice(end);
                setInput(next);
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = start + 1;
                  autoResizeTextarea(el);
                });
              }
            }}
            rows={1}
            id="gen-chat-input"
          />
          <div className="input-actions-col">
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              title="Send (Enter)"
              id="gen-send-btn"
              type="button"
            >
              <IconSend />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
