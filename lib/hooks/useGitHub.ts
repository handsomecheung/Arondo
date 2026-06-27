import { useState, useEffect } from "react";
import type { Session } from "@/types/home";

export function useGitHub({
  selectedSessionId,
  menuOpen,
  setSessions,
  setApiError,
}: {
  selectedSessionId: string | null;
  menuOpen: boolean;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setApiError: (err: { title: string; message: string } | null) => void;
}) {
  const [isCreatingPr, setIsCreatingPr] = useState(false);
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

  const handleCreatePr = async () => {
    if (!selectedSessionId || isCreatingPr) return;
    setIsCreatingPr(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/pr`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success && data.prUrl) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === selectedSessionId ? { ...s, prUrl: data.prUrl } : s,
          ),
        );
      } else {
        setApiError({
          title: "Create Pull Request Error",
          message: data.error || "Failed to create pull request",
        });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({
        title: "Create Pull Request Error",
        message: err.message || "An error occurred while creating pull request.",
      });
    } finally {
      setIsCreatingPr(false);
    }
  };

  return { isCreatingPr, isCheckingGitChanges, hasGitChanges, isGitRepo, handleCreatePr };
}
