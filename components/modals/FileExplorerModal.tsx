import { IconX, IconCornerLeftUp, IconFolder } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onChangePath: (p: string) => void;
  parentPath: string | null;
  directories: { name: string; path: string }[];
  loading: boolean;
  onSelect: (path: string) => void;
}

export default function FileExplorerModal({
  open,
  onClose,
  currentPath,
  onChangePath,
  parentPath,
  directories,
  loading,
  onSelect,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Select Project Directory</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <div className="fs-current-path">{currentPath}</div>
          <div className="fs-list">
            {parentPath !== null && (
              <div className="fs-item fs-parent" onClick={() => onChangePath(parentPath)}>
                <span className="fs-item-icon"><IconCornerLeftUp /></span>
                <span className="fs-item-name">.. (Go Up)</span>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Loading directories…
              </div>
            ) : directories.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No directories found.
              </div>
            ) : (
              directories.map((dir) => (
                <div key={dir.path} className="fs-item" onClick={() => onChangePath(dir.path)}>
                  <span className="fs-item-icon"><IconFolder /></span>
                  <span className="fs-item-name" title={dir.name}>{dir.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={() => onSelect(currentPath)}>
            Select Directory
          </button>
        </div>
      </div>
    </div>
  );
}
