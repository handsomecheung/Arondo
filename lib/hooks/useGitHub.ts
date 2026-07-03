import { useState, useEffect } from "react";

export function useGitHub({
  selectedSessionId,
  menuOpen,
}: {
  selectedSessionId: string | null;
  menuOpen: boolean;
}) {
  const [isCheckingGitChanges, setIsCheckingGitChanges] = useState(false);
  const [hasGitChanges, setHasGitChanges] = useState(true);
  const [isGitRepo, setIsGitRepo] = useState(true);

  useEffect(() => {
    if (!menuOpen || !selectedSessionId) return;

    setIsCheckingGitChanges(true);
    fetch(`/api/sessions/${selectedSessionId}/git-status`)
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
  }, [menuOpen, selectedSessionId]);

  return { isCheckingGitChanges, hasGitChanges, isGitRepo };
}
