"use client";

import { useState } from "react";
import { IconX, IconChevronDown } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  messageId?: string;
  filePath?: string;
  projectId?: string;
}

export default function DiffModal({ open, onClose, sessionId, messageId, filePath, projectId }: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  if (!open) return null;

  const iframeSrc = filePath && messageId
    ? `/api/sessions/${sessionId}/diff?wrap=${wordWrap}&messageId=${messageId}&path=${encodeURIComponent(filePath)}&projectId=${projectId || ""}`
    : `/api/sessions/${sessionId}/diff?wrap=${wordWrap}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-lg diff-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span className="modal-title" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {filePath ? `Diff: ${filePath.split("/").pop()}` : "Git Diff"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className={`modal-close-btn fb-options-toggle${optionsOpen ? " active" : ""}`}
              onClick={() => setOptionsOpen((v) => !v)}
              aria-label="Toggle options"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconChevronDown className={optionsOpen ? "fb-chevron-up" : undefined} />
            </button>
            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconX />
            </button>
          </div>
        </div>

        {optionsOpen && (
          <div className="fb-options-bar">
            <button
              className={`fb-wrap-btn${wordWrap ? " active" : ""}`}
              onClick={() => setWordWrap((v) => !v)}
            >
              ↵ Wrap
            </button>
          </div>
        )}

        <div
          className="modal-body"
          style={{
            flex: 1,
            padding: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <iframe
            src={iframeSrc}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
