"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import TerminalKeyboardBar from "./TerminalKeyboardBar";

const CTRL_MAP: Record<string, string> = {
  "@": "\x00", "[": "\x1b", "\\": "\x1c", "]": "\x1d", "^": "\x1e", "_": "\x1f", "?": "\x7f",
};

function applyCtrl(ch: string): string {
  if (CTRL_MAP[ch]) return CTRL_MAP[ch];
  const code = ch.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
  return ch;
}

interface ShellTerminalProps {
  ws: WebSocket | null;
  cwd?: string;
  runnerId?: string;
  sessionId?: string;
  open?: boolean;
  onClose?: () => void;
}

export default function ShellTerminal({ ws, cwd, runnerId, sessionId, open, onClose }: ShellTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const shellIdRef = useRef<string | null>(null);
  const lastSpawnRef = useRef<{ ws: WebSocket | null; sessionId?: string; runnerId?: string }>({
    ws: null,
    sessionId: undefined,
    runnerId: undefined,
  });
  const [wsReady, setWsReady] = useState(ws?.readyState === WebSocket.OPEN);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [keybarHeight, setKeybarHeight] = useState(0);
  const ctrlActiveRef = useRef(false);
  const altActiveRef = useRef(false);
  const sendInputRef = useRef<(data: string) => void>(() => {});

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
        background: "#f8fafc",
        foreground: "#0f172a",
        cursor: "#4f46e5",
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
    const textarea = term.textarea || containerRef.current.querySelector("textarea");
    if (textarea) {
      textarea.setAttribute("autocorrect", "off");
      textarea.setAttribute("autocapitalize", "none");
      textarea.setAttribute("spellcheck", "false");
      textarea.setAttribute("autocomplete", "off");
    }
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

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

    const sendInput = (data: string) => {
      if (ws.readyState === WebSocket.OPEN && shellIdRef.current) {
        ws.send(JSON.stringify({ type: "shell:input", shellId: shellIdRef.current, data }));
      }
    };
    sendInputRef.current = sendInput;

    const isSameSpawn =
      lastSpawnRef.current.ws === ws &&
      lastSpawnRef.current.sessionId === sessionId &&
      lastSpawnRef.current.runnerId === runnerId;

    if (!isSameSpawn) {
      lastSpawnRef.current = { ws, sessionId, runnerId };
      shellIdRef.current = null;

      const cols = term.cols || 80;
      const rows = term.rows || 24;
      ws.send(JSON.stringify({ type: "shell:spawn", runnerId, sessionId, cwd, cols, rows }));
    }

    const onData = term.onData((data) => {
      let out = data;
      if (data.length === 1 && (ctrlActiveRef.current || altActiveRef.current)) {
        if (ctrlActiveRef.current) out = applyCtrl(out);
        if (altActiveRef.current) out = "\x1b" + out;
        ctrlActiveRef.current = false;
        altActiveRef.current = false;
        setCtrlActive(false);
        setAltActive(false);
      }
      sendInput(out);
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
          const { cols, rows } = term;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "shell:resize", shellId: msg.shellId, cols, rows }));
          }
        } else if (msg.type === "shell:output" && msg.shellId === shellIdRef.current) {
          term.write(msg.data);
        } else if (msg.type === "shell:exit" && msg.shellId === shellIdRef.current) {
          term.write(`\r\n\x1b[90m[Shell exited with code ${msg.code}]\x1b[0m\r\n`);
          shellIdRef.current = null;
          if (onClose) {
            onClose();
          }
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener("message", onMessage);

    // If we already have a shellId, request a resize to make sure it's correct
    if (shellIdRef.current && ws.readyState === WebSocket.OPEN) {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "shell:resize", shellId: shellIdRef.current, cols, rows }));
    }

    return () => {
      onData.dispose();
      onResize.dispose();
      ws.removeEventListener("message", onMessage);
    };
  }, [ws, wsReady, cwd, runnerId, sessionId]);

  const handleToolbarKey = (data: string) => {
    termRef.current?.focus();
    sendInputRef.current(data);
  };

  const handleToggleCtrl = () => {
    ctrlActiveRef.current = !ctrlActiveRef.current;
    setCtrlActive(ctrlActiveRef.current);
    termRef.current?.focus();
  };

  const handleToggleAlt = () => {
    altActiveRef.current = !altActiveRef.current;
    setAltActive(altActiveRef.current);
    termRef.current?.focus();
  };

  const handleToggleNativeKeyboard = () => {
    const term = termRef.current;
    if (!term) return;
    const textarea = (term as unknown as { textarea?: HTMLTextAreaElement }).textarea;
    if (textarea && document.activeElement === textarea) {
      textarea.blur();
    } else {
      term.focus();
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 300 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: `calc(100% - ${keybarHeight}px)` }}
      />
      <TerminalKeyboardBar
        onKey={handleToolbarKey}
        ctrlActive={ctrlActive}
        altActive={altActive}
        onToggleCtrl={handleToggleCtrl}
        onToggleAlt={handleToggleAlt}
        onToggleNativeKeyboard={handleToggleNativeKeyboard}
        onHeightChange={setKeybarHeight}
      />
    </div>
  );
}
