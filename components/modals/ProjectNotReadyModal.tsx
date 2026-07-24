import { IconX } from "@/components/Icons";

interface Props {
  pendingConfirmation: { reason: { dirty: boolean; busy: boolean; queued?: boolean }; isFollowup?: boolean } | null;
  onResolve: (choice: "force" | "pendingAuto" | "draft") => void;
  onCancel: () => void;
}

export default function ProjectNotReadyModal({ pendingConfirmation, onResolve, onCancel }: Props) {
  if (!pendingConfirmation) return null;
  const { dirty, busy, queued } = pendingConfirmation.reason;
  const autoLabel = pendingConfirmation.isFollowup
    ? "Send automatically once earlier messages are handled"
    : "Send automatically once ready";

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <span className="modal-title">Project not ready</span>
          <button className="modal-close-btn" onClick={onCancel} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "20px 16px" }}>
          <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 8 }}>
            {busy && dirty
              ? "This project has an agent already running and uncommitted changes in the working tree."
              : busy && queued
                ? "This session already has an agent running and a message queued ahead of this one."
                : busy
                  ? "This project has an agent already running."
                  : queued
                    ? "This session already has a message queued to send."
                    : "This project's working tree has uncommitted changes."}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>How would you like to proceed?</p>
        </div>
        <div
          className="modal-footer"
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)" }}
        >
          <button
            className="new-task-btn"
            onClick={() => onResolve("pendingAuto")}
            autoFocus
            style={{ padding: "8px 16px", background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#ffffff", fontSize: 13, cursor: "pointer" }}
          >
            {autoLabel}
          </button>
          <button
            className="new-task-btn"
            onClick={() => onResolve("draft")}
            style={{ padding: "8px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13, cursor: "pointer" }}
          >
            Save as draft, send manually later
          </button>
          <button
            className="new-task-btn"
            onClick={() => onResolve("force")}
            style={{ padding: "8px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13, cursor: "pointer" }}
          >
            Send now anyway
          </button>
        </div>
      </div>
    </div>
  );
}
