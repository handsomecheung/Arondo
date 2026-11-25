"use client";

import Link from "next/link";
import { IconVolume, IconX } from "@/components/Icons";
import type { SpeechError } from "@/lib/hooks/useSpeech";

interface Props {
  error: SpeechError | null;
  onClose: () => void;
}

export default function SpeechErrorModal({ error, onClose }: Props) {
  if (!error) return null;
  const notConfigured = error.kind === "not-configured";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal info-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="info-dialog-header">
          <div className="info-dialog-icon-wrap">
            <IconVolume size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="info-dialog-title">
              {notConfigured ? "Text-to-speech is not set up" : "Read Aloud failed"}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="info-dialog-body">
          {notConfigured ? (
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Add a <code>GOOGLE_TTS_API_KEY</code> under <strong>Admin Settings → Automodel &amp; LLM API Keys</strong>.
              It is a Google Cloud Text-to-Speech key, separate from the Gemini API key.
            </p>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: "var(--text-secondary)",
                maxHeight: 260,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "monospace",
              }}
            >
              {error.message}
            </pre>
          )}
        </div>
        <div className="info-dialog-footer">
          <button className="modal-btn-secondary" onClick={onClose}>
            {notConfigured ? "Cancel" : "Dismiss"}
          </button>
          {notConfigured && (
            <Link
              href="/admin/settings/automodel"
              className="modal-btn-primary"
              onClick={onClose}
              style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
            >
              Open Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
