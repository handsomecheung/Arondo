import { useState, useEffect } from "react";

export function useFileSystem(runnerId: string) {
  const [fsModalOpen, setFsModalOpen] = useState(false);
  const [fsCurrentPath, setFsCurrentPath] = useState("/");
  const [fsDirectories, setFsDirectories] = useState<{ name: string; path: string }[]>([]);
  const [fsParentPath, setFsParentPath] = useState<string | null>(null);
  const [fsLoading, setFsLoading] = useState(false);

  useEffect(() => {
    if (!fsModalOpen || !runnerId) return;

    setFsLoading(true);
    fetch(
      `/api/fs?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(fsCurrentPath)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load directories");
        return r.json();
      })
      .then((data) => {
        setFsDirectories(data.directories || []);
        setFsParentPath(data.parentPath || null);
        if (data.currentPath) {
          setFsCurrentPath(data.currentPath);
        }
      })
      .catch((err) => {
        console.error(err);
        setFsDirectories([]);
        setFsParentPath(null);
      })
      .finally(() => {
        setFsLoading(false);
      });
  }, [fsCurrentPath, fsModalOpen, runnerId]);

  return {
    fsModalOpen, setFsModalOpen,
    fsCurrentPath, setFsCurrentPath,
    fsDirectories,
    fsParentPath,
    fsLoading,
  };
}
