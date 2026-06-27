import { IconX } from "@/components/Icons";

interface Props {
  renameModal: { sessionId: string; currentName: string } | null;
  onClose: () => void;
  renameInput: string;
  onRenameInputChange: (v: string) => void;
  onSave: (sessionId: string, name: string) => void;
}

export default function RenameSessionDialog({
  renameModal,
  onClose,
  renameInput,
  onRenameInputChange,
  onSave,
}: Props) {
  if (!renameModal) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px" }}>
        <div className="modal-header">
          <span className="modal-title">Rename Session</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "20px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
              htmlFor="rename-session-input"
              style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              Session Name
            </label>
            <input
              id="rename-session-input"
              type="text"
              value={renameInput}
              onChange={(e) => onRenameInputChange(e.target.value)}
              placeholder="Enter session name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameInput.trim()) {
                  onSave(renameModal.sessionId, renameInput.trim());
                }
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: "flex-end", gap: "8px" }}>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={() => onSave(renameModal.sessionId, renameInput.trim())}
            disabled={!renameInput.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
