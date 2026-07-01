import { IconX } from "@/components/Icons";

interface Props {
  text: string | null;
  onClose: () => void;
  title?: string;
}

export default function CommandModal({ text, onClose, title = "Command" }: Props) {
  if (!text) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {title}
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "16px 20px" }}>
          <pre
            style={{
              margin: 0,
              padding: "12px 16px",
              background: "var(--bg-tertiary, #1a1a2e)",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: "var(--text-primary, #e0e0e0)",
            }}
          >
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}
