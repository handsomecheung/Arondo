"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@/components/Icons";

interface Props {
  open: boolean;
  command: string;
  onCommandChange: (command: string) => void;
  onClose: () => void;
  onRun: () => void;
  isRunning: boolean;
}

export default function ProjectScriptCommandModal({
  open,
  command,
  onCommandChange,
  onClose,
  onRun,
  isRunning,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title">Run Project Script</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "16px 20px" }}>
          <textarea
            ref={inputRef}
            value={command}
            onChange={(event) => onCommandChange(event.target.value)}
            placeholder="Enter a shell command"
            rows={4}
            style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }}
          />
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={isRunning}>Cancel</button>
          <button className="modal-btn-primary" onClick={onRun} disabled={!command.trim() || isRunning}>
            {isRunning ? "Starting…" : "Run Script"}
          </button>
        </div>
      </div>
    </div>
  );
}
