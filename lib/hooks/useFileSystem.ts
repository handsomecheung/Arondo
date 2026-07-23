import { useState, useEffect } from "react";

export function useFileSystem(defaultRunnerId: string) {
  const [fsModalOpen, setFsModalOpen] = useState(false);
  const [fsRunnerId, setFsRunnerId] = useState(defaultRunnerId);
  const [fsCurrentPath, setFsCurrentPath] = useState("/");
  const [fsDirectories, setFsDirectories] = useState<{ name: string; path: string }[]>([]);
  const [fsEntries, setFsEntries] = useState<{ name: string; path: string; isDir: boolean }[]>([]);
  const [fsParentPath, setFsParentPath] = useState<string | null>(null);
  const [fsLoading, setFsLoading] = useState(false);

  const openModal = (runnerId: string, path: string) => {
    setFsRunnerId(runnerId);
    setFsCurrentPath(path);
    setFsModalOpen(true);
  };

  useEffect(() => {
    if (!fsModalOpen || !fsRunnerId) return;

    setFsLoading(true);
    fetch(
      `/api/fs?runner=${encodeURIComponent(fsRunnerId)}&path=${encodeURIComponent(fsCurrentPath)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load directory items");
        return r.json();
      })
      .then((data) => {
        setFsDirectories(data.directories || []);
        setFsEntries(data.entries || []);
        setFsParentPath(data.parentPath || null);
        if (data.currentPath) {
          setFsCurrentPath(data.currentPath);
        }
      })
      .catch((err) => {
        console.error(err);
        setFsDirectories([]);
        setFsEntries([]);
        setFsParentPath(null);
      })
      .finally(() => {
        setFsLoading(false);
      });
  }, [fsCurrentPath, fsModalOpen, fsRunnerId]);

  return {
    fsModalOpen, setFsModalOpen, openModal,
    fsRunnerId, setFsRunnerId,
    fsCurrentPath, setFsCurrentPath,
    fsDirectories,
    fsEntries, setFsEntries,
    fsParentPath,
    fsLoading,
  };
}
