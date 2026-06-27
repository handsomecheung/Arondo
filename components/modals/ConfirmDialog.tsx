interface Props {
  confirmDialog: { message: string; onConfirm: () => void } | null;
  onClose: () => void;
}

export default function ConfirmDialog({ confirmDialog, onClose }: Props) {
  if (!confirmDialog) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <div className="confirm-dialog-content">
            <p className="confirm-dialog-title">Confirm Delete</p>
            <p className="confirm-dialog-message">{confirmDialog.message}</p>
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-danger" onClick={confirmDialog.onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
