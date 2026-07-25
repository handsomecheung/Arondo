interface Props {
  confirmDialog: {
    message: string;
    onConfirm: () => void;
    title?: string;
    confirmLabel?: string;
    danger?: boolean;
  } | null;
  onClose: () => void;
}

export default function ConfirmDialog({ confirmDialog, onClose }: Props) {
  if (!confirmDialog) return null;
  const { title = "Confirm Delete", confirmLabel = "Delete", danger = true } = confirmDialog;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon">
            {danger ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
          </div>
          <div className="confirm-dialog-content">
            <p className="confirm-dialog-title">{title}</p>
            <p className="confirm-dialog-message">{confirmDialog.message}</p>
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className={danger ? "modal-btn-danger" : "modal-btn-primary"} onClick={confirmDialog.onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
