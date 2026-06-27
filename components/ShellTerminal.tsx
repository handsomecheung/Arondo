"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface ShellTerminalProps {
  ws: WebSocket | null;
  cwd?: string;
  runnerId?: string;
  sessionId?: string;
  open?: boolean;
}

export default function ShellTerminal({ ws, cwd, runnerId, sessionId, open }: ShellTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const shellIdRef = useRef<string | null>(null);
  const [wsReady, setWsReady] = useState(ws?.readyState === WebSocket.OPEN);

  useEffect(() => {
    if (open && termRef.current) {
      requestAnimationFrame(() => {
        termRef.current?.focus();
      });
    }
  }, [open]);

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
      cursorBlink: true,
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
    requestAnimationFrame(() => fit.fit());

    termRef.current = term;
    fitRef.current = fit;

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
  }, []);

  useEffect(() => {
    if (!ws || !wsReady) return;
    const term = termRef.current;
    if (!term) return;

    const { cols, rows } = term;
    ws.send(JSON.stringify({ type: "shell:spawn", runnerId, sessionId, cwd, cols, rows }));

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN && shellIdRef.current) {
        ws.send(JSON.stringify({ type: "shell:input", shellId: shellIdRef.current, data }));
      }
    });

    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN && shellIdRef.current) {
        ws.send(JSON.stringify({ type: "shell:resize", shellId: shellIdRef.current, cols, rows }));
      }
    });

    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "shell:spawned") {
          shellIdRef.current = msg.shellId;
        } else if (msg.type === "shell:output" && msg.shellId === shellIdRef.current) {
          term.write(msg.data);
        } else if (msg.type === "shell:exit" && msg.shellId === shellIdRef.current) {
          term.write(`\r\n\x1b[90m[Shell exited with code ${msg.code}]\x1b[0m\r\n`);
          shellIdRef.current = null;
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener("message", onMessage);

    return () => {
      onData.dispose();
      onResize.dispose();
      ws.removeEventListener("message", onMessage);
      shellIdRef.current = null;
    };
  }, [ws, wsReady, cwd, runnerId, sessionId]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 300 }}
    />
  );
}
