import { useState, useEffect } from "react";

export function useGitHub({
  selectedSessionId,
  selectedProjectId,
  menuOpen,
}: {
  selectedSessionId: string | null;
  selectedProjectId?: string | null;
  menuOpen: boolean;
}) {
  const [isCheckingGitChanges, setIsCheckingGitChanges] = useState(false);
  const [hasGitChanges, setHasGitChanges] = useState(true);
  const [isGitRepo, setIsGitRepo] = useState(true);

  useEffect(() => {
    if (!menuOpen) return;

    const url = selectedProjectId
      ? `/api/projects/${selectedProjectId}/git-status`
      : selectedSessionId
        ? `/api/sessions/${selectedSessionId}/git-status`
        : null;

    if (!url) return;

    setIsCheckingGitChanges(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setHasGitChanges(!!data.hasChanges);
        setIsGitRepo(data.isGitRepo !== false);
      })
      .catch((err) => {
        console.error("Failed to check git status:", err);
        setHasGitChanges(true);
        setIsGitRepo(true);
      })
      .finally(() => {
        setIsCheckingGitChanges(false);
      });
  }, [menuOpen, selectedSessionId, selectedProjectId]);

  return { isCheckingGitChanges, hasGitChanges, isGitRepo };
}
