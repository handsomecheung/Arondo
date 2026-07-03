"use client";

import { useEffect, useRef, useState } from "react";

interface KeyDef {
  label: string;
  data: string;
}

const SLASH_GROUP: KeyDef[] = [
  { label: "/", data: "/" },
  { label: "|", data: "|" },
  { label: "-", data: "-" },
];

const PRIMARY_ROW1: KeyDef[] = [
  { label: "ESC", data: "\x1b" },
  { label: "HOME", data: "\x1b[H" },
  { label: "↑", data: "\x1b[A" },
  { label: "END", data: "\x1b[F" },
  { label: "PGUP", data: "\x1b[5~" },
];

const PRIMARY_ROW2: KeyDef[] = [
  { label: "TAB", data: "\t" },
  { label: "←", data: "\x1b[D" },
  { label: "↓", data: "\x1b[B" },
  { label: "→", data: "\x1b[C" },
  { label: "PGDN", data: "\x1b[6~" },
];

const FN_ROW1: KeyDef[] = [
  { label: "F1", data: "\x1bOP" },
  { label: "F2", data: "\x1bOQ" },
  { label: "F3", data: "\x1bOR" },
  { label: "F4", data: "\x1bOS" },
  { label: "F5", data: "\x1b[15~" },
  { label: "F6", data: "\x1b[17~" },
  { label: "~", data: "~" },
  { label: "`", data: "`" },
];

const FN_ROW2: KeyDef[] = [
  { label: "F7", data: "\x1b[18~" },
  { label: "F8", data: "\x1b[19~" },
  { label: "F9", data: "\x1b[20~" },
  { label: "F10", data: "\x1b[21~" },
  { label: "F11", data: "\x1b[23~" },
  { label: "F12", data: "\x1b[24~" },
  { label: "INS", data: "\x1b[2~" },
  { label: "DEL", data: "\x1b[3~" },
];

interface Props {
  onKey: (data: string) => void;
  ctrlActive: boolean;
  altActive: boolean;
  onToggleCtrl: () => void;
  onToggleAlt: () => void;
  onToggleNativeKeyboard: () => void;
  onHeightChange?: (height: number) => void;
}

export default function TerminalKeyboardBar({
  onKey,
  ctrlActive,
  altActive,
  onToggleCtrl,
  onToggleAlt,
  onToggleNativeKeyboard,
  onHeightChange,
}: Props) {
  const [fnLayer, setFnLayer] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const bottomOffsetRef = useRef(0);
  const barHeightRef = useRef(0);
  const row1 = fnLayer ? FN_ROW1 : PRIMARY_ROW1;
  const row2 = fnLayer ? FN_ROW2 : PRIMARY_ROW2;
  const totalCols = fnLayer ? 9 : 8;
  const rowStyle = { gridTemplateColumns: `repeat(${totalCols}, 1fr)` };

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      bottomOffsetRef.current = offset;
      setBottomOffset(offset);
      onHeightChange?.(barHeightRef.current + offset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [onHeightChange]);

  useEffect(() => {
    if (!barRef.current) return;
    const el = barRef.current;
    const report = () => {
      barHeightRef.current = el.offsetHeight;
      onHeightChange?.(el.offsetHeight + bottomOffsetRef.current);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <div
      ref={barRef}
      className="term-keybar"
      style={{ bottom: bottomOffset }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="term-keybar-row" style={rowStyle}>
        {fnLayer ? (
          row1.map((k) => (
            <button
              key={k.label}
              type="button"
              className="term-keybar-key"
              onClick={() => onKey(k.data)}
            >
              {k.label}
            </button>
          ))
        ) : (
          <>
            <button type="button" className="term-keybar-key" onClick={() => onKey(PRIMARY_ROW1[0].data)}>
              {PRIMARY_ROW1[0].label}
            </button>
            <div className="term-keybar-key-group">
              {SLASH_GROUP.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  className="term-keybar-key"
                  onClick={() => onKey(k.data)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {PRIMARY_ROW1.slice(1).map((k) => (
              <button
                key={k.label}
                type="button"
                className="term-keybar-key"
                onClick={() => onKey(k.data)}
              >
                {k.label}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          className={`term-keybar-key${fnLayer ? " active" : ""}`}
          onClick={() => setFnLayer((v) => !v)}
        >
          FN
        </button>
      </div>
      <div className="term-keybar-row" style={rowStyle}>
        {fnLayer ? (
          row2.map((k) => (
            <button
              key={k.label}
              type="button"
              className="term-keybar-key"
              onClick={() => onKey(k.data)}
            >
              {k.label}
            </button>
          ))
        ) : (
          <>
            <button type="button" className="term-keybar-key" onClick={() => onKey(PRIMARY_ROW2[0].data)}>
              {PRIMARY_ROW2[0].label}
            </button>
            <button
              type="button"
              className={`term-keybar-key${ctrlActive ? " active" : ""}`}
              onClick={onToggleCtrl}
            >
              CTRL
            </button>
            <button
              type="button"
              className={`term-keybar-key${altActive ? " active" : ""}`}
              onClick={onToggleAlt}
            >
              ALT
            </button>
            {PRIMARY_ROW2.slice(1).map((k) => (
              <button
                key={k.label}
                type="button"
                className="term-keybar-key"
                onClick={() => onKey(k.data)}
              >
                {k.label}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          className="term-keybar-key"
          onClick={onToggleNativeKeyboard}
          aria-label="Toggle keyboard"
        >
          <IconKeyboard />
        </button>
      </div>
    </div>
  );
}

function IconKeyboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
    </svg>
  );
}
