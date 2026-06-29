import { useState } from "react";
import { IconX, IconCornerLeftUp, IconFolder, IconFile } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onChangePath: (p: string) => void;
  parentPath: string | null;
  entries: { name: string; path: string; isDir: boolean }[];
  loading: boolean;
  projectRoot: string;
  onSelect: (path: string) => void;
}

export default function ChatFileSelectorModal({
  open,
  onClose,
  currentPath,
  onChangePath,
  parentPath,
  entries,
  loading,
  projectRoot,
  onSelect,
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (!open) return null;

  const isAtRoot = currentPath === projectRoot;

  const handleGoUp = () => {
    if (parentPath && !isAtRoot) {
      setSelectedPath(null);
      onChangePath(parentPath);
    }
  };

  const handleItemClick = (entry: { name: string; path: string; isDir: boolean }) => {
    if (entry.isDir) {
      setSelectedPath(null);
      onChangePath(entry.path);
    } else {
      setSelectedPath(entry.path);
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onSelect(selectedPath);
    } else {
      onSelect(currentPath);
    }
  };

  const selectedName = selectedPath 
    ? selectedPath.split("/").pop() 
    : currentPath.split("/").pop() || "Directory";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Select File or Directory</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <div className="fs-current-path">{currentPath}</div>
          <div className="fs-list" style={{ maxHeight: "300px", overflowY: "auto" }}>
            {parentPath !== null && !isAtRoot && (
              <div className="fs-item fs-parent" onClick={handleGoUp}>
                <span className="fs-item-icon"><IconCornerLeftUp /></span>
                <span className="fs-item-name">.. (Go Up)</span>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Loading items…
              </div>
            ) : entries.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No items found.
              </div>
            ) : (
              entries.map((entry) => {
                const isActive = selectedPath === entry.path;
                return (
                  <div 
                    key={entry.path} 
                    className={`fs-item${isActive ? " active" : ""}`}
                    onClick={() => handleItemClick(entry)}
                    onDoubleClick={() => {
                      if (entry.isDir) {
                        setSelectedPath(null);
                        onChangePath(entry.path);
                      } else {
                        onSelect(entry.path);
                      }
                    }}
                  >
                    <span className="fs-item-icon">
                      {entry.isDir ? <IconFolder /> : <IconFile />}
                    </span>
                    <span className="fs-item-name" title={entry.name}>{entry.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleConfirm}>
            {selectedPath ? `Select File: ${selectedName}` : `Select Directory: ${selectedName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
