import { useState, useEffect } from "react";
import { IconX, IconCornerLeftUp, IconFolder, IconPlus } from "@/components/Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onChangePath: (p: string) => void;
  parentPath: string | null;
  directories: { name: string; path: string }[];
  loading: boolean;
  onSelect: (path: string) => void;
  onCreateDirectory: (name: string) => Promise<void>;
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
  onCreateDirectory,
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isDirectoryFormOpen, setIsDirectoryFormOpen] = useState(false);
  const [isCreatingDirectory, setIsCreatingDirectory] = useState(false);
  const [directoryName, setDirectoryName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath(null);
    setIsDirectoryFormOpen(false);
    setDirectoryName("");
    setCreateError(null);
  }, [currentPath, open]);

  if (!open) return null;

  const handleGoUp = () => {
    if (parentPath !== null) {
      setSelectedPath(null);
      onChangePath(parentPath);
    }
  };

  const handleItemClick = (dir: { name: string; path: string }) => {
    if (selectedPath === dir.path) {
      setSelectedPath(null);
      onChangePath(dir.path);
    } else {
      setSelectedPath(dir.path);
    }
  };

  const handleItemDoubleClick = (dir: { name: string; path: string }) => {
    setSelectedPath(null);
    onChangePath(dir.path);
  };

  const selectedName = selectedPath
    ? selectedPath.split("/").filter(Boolean).pop() || selectedPath
    : currentPath.split("/").filter(Boolean).pop() || currentPath;

  const handleConfirm = () => {
    onSelect(selectedPath || currentPath);
  };

  const handleCreateDirectory = async () => {
    const name = directoryName.trim();
    if (!name) return;

    setIsCreatingDirectory(true);
    setCreateError(null);
    try {
      await onCreateDirectory(name);
      setIsDirectoryFormOpen(false);
      setDirectoryName("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create directory");
    } finally {
      setIsCreatingDirectory(false);
    }
  };

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
          {isDirectoryFormOpen ? (
            <div className="fs-create-directory">
              <input
                autoFocus
                className="fs-create-directory-input"
                value={directoryName}
                onChange={(e) => setDirectoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateDirectory();
                }}
                placeholder="New directory name"
                aria-label="New directory name"
                disabled={isCreatingDirectory}
              />
              <button
                className="modal-btn-primary fs-create-directory-button"
                onClick={handleCreateDirectory}
                disabled={!directoryName.trim() || isCreatingDirectory}
              >
                {isCreatingDirectory ? "Creating…" : "Create"}
              </button>
            </div>
          ) : (
            <button
              className="modal-btn-primary fs-create-directory-button"
              onClick={() => setIsDirectoryFormOpen(true)}
            >
              <IconPlus /> New Directory
            </button>
          )}
          {createError && <div className="fs-create-directory-error">{createError}</div>}
          <div className="fs-list">
            {parentPath !== null && (
              <div className="fs-item fs-parent" onClick={handleGoUp}>
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
              directories.map((dir) => {
                const isSelected = selectedPath === dir.path;
                return (
                  <div
                    key={dir.path}
                    className={`fs-item${isSelected ? " active" : ""}`}
                    onClick={() => handleItemClick(dir)}
                    onDoubleClick={() => handleItemDoubleClick(dir)}
                  >
                    <span
                      className="fs-item-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemDoubleClick(dir);
                      }}
                      title="Open folder"
                    >
                      <IconFolder />
                    </span>
                    <span className="fs-item-name" title={dir.name}>{dir.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleConfirm}>
            {selectedName ? `Select Directory: ${selectedName}` : "Select Directory"}
          </button>
        </div>
      </div>
    </div>
  );
}
