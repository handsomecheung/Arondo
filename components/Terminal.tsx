"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  projectId?: string;
  messageId: string;
  ws: WebSocket | null;
  mode: "live" | "history";
  taskType?: "agent" | "script";
}

export default function Terminal({ sessionId, projectId, messageId, ws, mode, taskType }: TerminalProps) {
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

    const disableInput = mode === "history" || taskType === "agent";
    const term = new XTerm({
      cursorBlink: mode === "live" && !disableInput,
      disableStdin: disableInput,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        scrollbarSliderBackground: "transparent",
        scrollbarSliderHoverBackground: "transparent",
        scrollbarSliderActiveBackground: "transparent",
      },
      convertEol: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fit.fit();
    });

    termRef.current = term;
    fitRef.current = fit;
    attachedRef.current = false;

    const logUrl = sessionId
      ? `/api/sessions/${sessionId}/log?messageId=${messageId}`
      : `/api/sessions/global/log?messageId=${messageId}&projectId=${projectId || ""}`;

    fetch(logUrl)
      .then((r) => r.json())
      .then((data: { log: string }) => {
        if (termRef.current === term && data.log) {
          term.write(data.log);
        }
      })
      .catch(() => {});

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    resizeObserver.observe(containerRef.current);

    let touchStartY = 0;
    let touchAccum = 0;
    const lineHeight = Math.ceil(term.options.fontSize! * 1.2);
    const el = containerRef.current;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchAccum = 0;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dy = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;
      touchAccum += dy;
      const lines = Math.trunc(touchAccum / lineHeight);
      if (lines !== 0) {
        term.scrollLines(lines);
        touchAccum -= lines * lineHeight;
      }
      e.preventDefault();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [messageId, mode, sessionId, projectId, taskType]);

  // Live mode: WebSocket listener for real-time output
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
