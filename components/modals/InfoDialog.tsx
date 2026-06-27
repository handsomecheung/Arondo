import { IconX } from "@/components/Icons";

interface Props {
  infoDialog: {
    title: string;
    body: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  } | null;
  onClose: () => void;
}

export default function InfoDialog({ infoDialog, onClose }: Props) {
  if (!infoDialog) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal info-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="info-dialog-header">
          <div className="info-dialog-icon-wrap">
            <span style={{ fontSize: 22 }}>🤖</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="info-dialog-title">{infoDialog.title}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="info-dialog-body">{infoDialog.body}</div>
        <div className="info-dialog-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={infoDialog.onConfirm}>
            {infoDialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
