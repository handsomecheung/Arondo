"use client";

import { useCallback, useEffect, useState } from "react";
import type { TaskItem } from "@/types/home";

interface UseScriptsParams {
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  selectedSessionProjectId: string | undefined;
  setApiError: (err: { title: string; message: string } | null) => void;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setMenuOpen: (v: boolean) => void;
  setScriptSubMenuOpen: (v: boolean) => void;
}

export function useScripts({
  selectedSessionId,
  selectedProjectId,
  selectedSessionProjectId,
  setApiError,
  setTaskQueue,
  setMenuOpen,
  setScriptSubMenuOpen,
}: UseScriptsParams) {
  const [scriptHistory, setScriptHistory] = useState<Record<string, number>>({});
  const [isRunningScript, setIsRunningScript] = useState(false);

  const loadScriptHistory = useCallback((projectId: string) => {
    fetch(`/api/projects/${projectId}/script-history`)
      .then((r) => r.json())
      .then((data: Record<string, number>) => setScriptHistory(data && typeof data === "object" ? data : {}))
      .catch(() => setScriptHistory({}));
  }, []);

  useEffect(() => {
    const projectId = selectedProjectId || selectedSessionProjectId;
    if (projectId) loadScriptHistory(projectId);
    else setScriptHistory({});
  }, [selectedProjectId, selectedSessionProjectId, loadScriptHistory]);

  const handleRunScript = async (command: string, promptText?: string) => {
    if (!selectedSessionId) return;
    setMenuOpen(false);
    setScriptSubMenuOpen(false);
    setIsRunningScript(true);
    const tempTaskId = `script-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [...prev, {
      id: tempTaskId,
      type: "script",
      name: `Script: ${command}`,
      sessionId: selectedSessionId,
      status: "running",
      createdAt: Date.now(),
    }]);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/run-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, prompt: promptText }),
      });
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Run Script Error", message: data.error || "Failed to run script" });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      } else if (selectedSessionProjectId) {
        loadScriptHistory(selectedSessionProjectId);
      }
    } catch (err: any) {
      setApiError({ title: "Run Script Error", message: err.message || "An error occurred while running the script." });
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    } finally {
      setIsRunningScript(false);
    }
  };

  return { scriptHistory, isRunningScript, handleRunScript, loadScriptHistory };
}
