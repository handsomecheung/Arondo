"use client";

import { IconX, IconInfo } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  status: "running" | "done" | "error" | "stopped";
  statusText?: string;
  exitCode?: number;
  rawExitCode?: number;
  statusOverride?: boolean;
  failureKind?: string;
  overrideReason?: string;
}

export default function ResultStatusModal({
  open,
  onClose,
  status,
  statusText,
  exitCode,
  rawExitCode,
  statusOverride,
  failureKind,
  overrideReason,
}: Props) {
  if (!open) return null;

  const actualCode = rawExitCode ?? exitCode;
  const isOverridden = !!statusOverride;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          boxSizing: "border-box",
        }}
      >
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconInfo size={18} />
            <span>Execution Status</span>
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div
          className="modal-body"
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px 12px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-muted, #888)", flexShrink: 0 }}>Display Status:</span>
              <span style={{ fontWeight: 600 }}>
                {status === "done" && <span style={{ color: "var(--success, #22c55e)" }}>✅ Done ({statusText || "Completed"})</span>}
                {status === "error" && <span style={{ color: "var(--danger, #ef4444)" }}>❌ Error ({statusText || "Failed"})</span>}
                {status === "stopped" && <span style={{ color: "var(--warning, #eab308)" }}>🛑 Stopped</span>}
                {status === "running" && <span style={{ color: "var(--primary, #3b82f6)" }}>⏳ Running...</span>}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px 12px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-muted, #888)", flexShrink: 0 }}>Process Return Code:</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                {actualCode !== undefined ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: actualCode === 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: actualCode === 0 ? "var(--success, #22c55e)" : "var(--danger, #ef4444)",
                      fontWeight: 600,
                    }}
                  >
                    exitCode: {actualCode}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted, #888)" }}>Not available</span>
                )}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px 12px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-muted, #888)", flexShrink: 0 }}>Status Overridden:</span>
              <span>
                {isOverridden ? (
                  <span style={{ color: "var(--warning, #eab308)", fontWeight: 600 }}>
                    Yes (Rewritten to Done)
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted, #888)" }}>No (Direct result)</span>
                )}
              </span>
            </div>

            {failureKind && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px 12px", flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-muted, #888)", flexShrink: 0 }}>Classification:</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "var(--text-primary, #e0e0e0)",
                    background: "rgba(255, 255, 255, 0.06)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    wordBreak: "break-all",
                    maxWidth: "100%",
                  }}
                >
                  {failureKind}
                </span>
              </div>
            )}
          </div>

          {(overrideReason || isOverridden) && (
            <div
              style={{
                marginTop: 2,
                padding: "12px 14px",
                background: "var(--bg-tertiary, #1a1a2e)",
                borderRadius: 8,
                border: "1px solid var(--border-color, #2e2e48)",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--text-primary, #e0e0e0)",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-secondary, #aaa)" }}>
                Reason for Status Override:
              </div>
              <div>
                {overrideReason || "Process exited with non-zero code, but output analysis confirmed the task completed successfully with substantive content."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
