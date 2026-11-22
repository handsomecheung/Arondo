interface Props {
  open: boolean;
  onResolve: (send: boolean) => void;
}

export default function MessageCompletenessModal({ open, onResolve }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => onResolve(false)}>
      <div className="modal confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="completeness-title"
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
          if (e.key === "Escape") onResolve(false);
        }} style={{ maxWidth: 400 }}>
        <div className="confirm-dialog-body">
          <div className="confirm-dialog-content">
            <p id="completeness-title" className="confirm-dialog-title">Message unfinished?</p>
            <p className="confirm-dialog-message">Your message looks like it may still be in progress. Would you like to keep editing or send it as it is?</p>
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button className="modal-btn-secondary" autoFocus onClick={() => onResolve(false)}>Keep editing</button>
          <button className="modal-btn-primary" onClick={() => onResolve(true)}>Send anyway</button>
        </div>
      </div>
    </div>
  );
}
