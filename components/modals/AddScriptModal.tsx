import { IconX } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  editingScriptName: string | null;
  scriptName: string;
  onScriptNameChange: (v: string) => void;
  scriptCommand: string;
  onScriptCommandChange: (v: string) => void;
  onSave: () => void;
}

export default function AddScriptModal({
  open,
  onClose,
  editingScriptName,
  scriptName,
  onScriptNameChange,
  scriptCommand,
  onScriptCommandChange,
  onSave,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <span className="modal-title">{editingScriptName ? "Edit Script" : "Add Script"}</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Name</label>
            <input
              type="text"
              placeholder="e.g. build, test, lint"
              value={scriptName}
              onChange={(e) => onScriptNameChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
              id="script-name-input"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Command</label>
            <input
              type="text"
              placeholder="e.g. npm run build, pytest"
              value={scriptCommand}
              onChange={(e) => onScriptCommandChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
              id="script-command-input"
            />
          </div>
        </div>
        <div
          className="modal-footer"
          style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!scriptName.trim() || !scriptCommand.trim()}
            style={{
              padding: "8px 16px",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#ffffff",
              fontSize: 13,
              cursor: "pointer",
              opacity: !scriptName.trim() || !scriptCommand.trim() ? 0.5 : 1,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
