interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AutoAnalyzingNotice({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "380px", padding: 24, textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="spinner" />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              AI Background Analysis
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: "1.5" }}>
              Analyzing project structure in the background. New scripts will appear automatically on this page once finished.
            </p>
            <p style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
              You can safely close this notification now.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#ffffff",
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
