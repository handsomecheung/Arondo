"use client";

import { useState, useRef, useEffect } from "react";
import type { Session, Message, TaskItem } from "@/types/home";

interface UseWebSocketParams {
  selectedSessionId: string | null;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setSessionLog: React.Dispatch<React.SetStateAction<string>>;
  setActiveLogMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setLogModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useWebSocket({
  selectedSessionId,
  setSessions,
  setMessages,
  setTaskQueue,
  setSelectedSessionId,
  setSessionLog,
  setActiveLogMsgId,
  setLogModalOpen,
}: UseWebSocketParams): { connected: boolean; wsInstance: WebSocket | null } {
  const [connected, setConnected] = useState(false);
  const [wsInstance, setWsInstance] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const selectedSessionIdRef = useRef(selectedSessionId);
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;
    let disposed = false;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
      const wsUrl = `${proto}//${location.host}/ws`;
      const protocols = token ? ["arondo-token", token] : [];
      ws = new WebSocket(wsUrl, protocols);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setWsInstance(ws);
        reconnectDelay = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        setWsInstance(null);
        if (!disposed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 10000);
            connect();
          }, reconnectDelay);
        }
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string; payload: any };
          const currentSelectedSessionId = selectedSessionIdRef.current;

          if (event.type === "session:updated") {
            const updated = event.payload as Session;
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s)),
            );
            if (updated.status === "script-running") {
              setTaskQueue((prev) =>
                prev.filter((t) => {
                  if (t.sessionId !== updated.id) return true;
                  if (t.type === "agent") return false;
                  const running = updated.runningScripts || [];
                  const scriptName = t.name.startsWith("Script: ")
                    ? t.name.substring(8)
                    : t.name;
                  return running.includes(scriptName);
                }),
              );
            } else if (
              updated.status === "done" ||
              updated.status === "error" ||
              updated.status === "idle"
            ) {
              setTaskQueue((prev) =>
                prev.filter((t) => t.sessionId !== updated.id),
              );
            }
          }

          if (event.type === "session:deleted") {
            const { id } = event.payload as { id: string };
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (currentSelectedSessionId === id) {
              setSelectedSessionId(null);
              setMessages([]);
              setSessionLog("");
              setActiveLogMsgId(null);
              setLogModalOpen(false);
            }
          }

          if (event.type === "message:added") {
            const msg = event.payload as Message;

            if (msg.type === "script-return" || msg.type === "agent-return") {
              setTaskQueue((prev) =>
                prev.filter((t) => t.messageId !== msg.parentId && t.id !== msg.parentId)
              );
            }

            if (msg.sessionId === currentSelectedSessionId) {
              setMessages((prev) => {
                if (prev.find((m) => m.id === msg.id)) return prev;
                const filtered = prev.filter(
                  (m) => !(m.parentId === msg.parentId && m.id.startsWith("optimistic-stopped-"))
                );
                return [...filtered, msg];
              });
            }

            if (msg.role === "system") {
              if (msg.type === "agent-run") {
                setTaskQueue((prev) => {
                  const idx = prev.findIndex(
                    (t) =>
                      t.sessionId === msg.sessionId &&
                      t.type === "agent" &&
                      !t.messageId,
                  );
                  if (idx !== -1) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], messageId: msg.id };
                    return next;
                  }
                  return prev;
                });
              } else if (msg.type === "script-run") {
                setTaskQueue((prev) => {
                  let idx = -1;
                  const match = msg.content.match(
                    /Running script:\s*\*\*([^*]+)\*\*/i,
                  );
                  if (match) {
                    const sName = match[1].trim();
                    idx = prev.findIndex(
                      (t) =>
                        t.sessionId === msg.sessionId &&
                        t.type === "script" &&
                        !t.messageId &&
                        (t.name === `Script: ${sName}` || t.name === sName),
                    );
                  }
                  if (idx === -1) {
                    idx = prev.findIndex(
                      (t) =>
                        t.sessionId === msg.sessionId &&
                        t.type === "script" &&
                        !t.messageId,
                    );
                  }
                  if (idx !== -1) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], messageId: msg.id };
                    return next;
                  }
                  return prev;
                });
              }
            }
          }
        } catch {
          /* ignore parse errors */
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      setWsInstance(null);
    };
  }, [setSessions, setMessages, setTaskQueue, setSelectedSessionId, setSessionLog, setActiveLogMsgId, setLogModalOpen]);


  return { connected, wsInstance };
}
