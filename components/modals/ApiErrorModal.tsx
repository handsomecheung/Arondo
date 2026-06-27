import { IconX } from "@/components/Icons";

interface Props {
  apiError: { title: string; message: string } | null;
  onClose: () => void;
}

export default function ApiErrorModal({ apiError, onClose }: Props) {
  if (!apiError) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
        <div className="modal-header">
          <span className="modal-title" style={{ color: "var(--error)", display: "flex", alignItems: "center", gap: 6 }}>
            ⚠️ {apiError.title}
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "20px 16px" }}>
          <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 12 }}>
            An error occurred during the operations:
          </p>
          <pre
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              fontSize: 12,
              color: "var(--text-secondary)",
              maxHeight: "260px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "monospace",
            }}
          >
            {apiError.message}
          </pre>
        </div>
        <div
          className="modal-footer"
          style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px", borderTop: "1px solid var(--border)" }}
        >
          <button
            className="new-task-btn"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#ffffff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
