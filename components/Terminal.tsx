"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  messageId: string;
  ws: WebSocket | null;
  mode: "live" | "history";
  historyLog?: string;
}

export default function Terminal({ sessionId, messageId, ws, mode, historyLog }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const attachedRef = useRef(false);
  const [wsReady, setWsReady] = useState(ws?.readyState === WebSocket.OPEN);

  useEffect(() => {
    if (!ws) { setWsReady(false); return; }
    if (ws.readyState === WebSocket.OPEN) { setWsReady(true); return; }
    const onOpen = () => setWsReady(true);
    const onClose = () => setWsReady(false);
    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("close", onClose);
    };
  }, [ws]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: mode === "live",
      disableStdin: mode === "history",
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
      },
      convertEol: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    requestAnimationFrame(() => fit.fit());

    termRef.current = term;
    fitRef.current = fit;
    attachedRef.current = false;

    if (mode === "history" && historyLog) {
      term.write(historyLog);
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [messageId, mode, historyLog]);

  useEffect(() => {
    if (mode !== "live" || !ws || !wsReady) return;
    const term = termRef.current;
    if (!term) return;

    if (!attachedRef.current) {
      attachedRef.current = true;
      ws.send(JSON.stringify({
        type: "terminal:attach",
        sessionId,
        messageId,
      }));
      const { cols, rows } = term;
      ws.send(JSON.stringify({
        type: "terminal:resize",
        sessionId,
        messageId,
        cols,
        rows,
      }));
    }

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "terminal:input",
          sessionId,
          messageId,
          data,
        }));
      }
    });

    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "terminal:resize",
          sessionId,
          messageId,
          cols,
          rows,
        }));
      }
    });

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.sessionId !== sessionId || msg.messageId !== messageId) return;
        if (msg.type === "terminal:output") {
          term.write(msg.data);
        } else if (msg.type === "terminal:exit") {
          term.write(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
        }
      } catch {
        /* ignore */
      }
    };
    ws.addEventListener("message", onMessage);

    return () => {
      onData.dispose();
      onResize.dispose();
      ws.removeEventListener("message", onMessage);
    };
  }, [mode, ws, wsReady, sessionId, messageId]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 300 }}
    />
  );
}
