"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ProjectScript, TaskItem } from "@/types/home";

interface UseScriptsParams {
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  selectedSessionProjectId: string | undefined;
  setApiError: (err: { title: string; message: string } | null) => void;
  setConfirmDialog: (dialog: { message: string; onConfirm: () => void } | null) => void;
  setInfoDialog: (dialog: { title: string; body: React.ReactNode; confirmLabel: string; onConfirm: () => void } | null) => void;
  setToast: (toast: { message: string; type: "success" | "info" | "error" } | null) => void;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setMenuOpen: (v: boolean) => void;
  setScriptSubMenuOpen: (v: boolean) => void;
}

const AUTO_SCRIPTS_DIALOG_BODY = (
  <>
    <p
      style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        marginBottom: 14,
      }}
    >
      Arondo will automatically analyze your project and generate a set of
      common scripts (e.g. build, test, lint).
    </p>
    <ul
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingLeft: 0,
        listStyle: "none",
        margin: 0,
      }}
    >
      <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🔍</span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--text-primary)" }}>Scans your codebase</strong>{" "}
          — reads package.json, Makefile, pyproject.toml and other config files to detect available commands.
        </span>
      </li>
      <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚡</span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--text-primary)" }}>Runs in the background</strong>{" "}
          — analysis is asynchronous. You can keep working; scripts will appear automatically once finished.
        </span>
      </li>
      <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>✏️</span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--text-primary)" }}>Fully editable</strong>{" "}
          — any generated script can be renamed, edited, or deleted afterwards.
        </span>
      </li>
    </ul>
  </>
);

export function useScripts({
  selectedProjectId,
  selectedSessionId,
  selectedSessionProjectId,
  setApiError,
  setConfirmDialog,
  setInfoDialog,
  setToast,
  setTaskQueue,
  setMenuOpen,
  setScriptSubMenuOpen,
}: UseScriptsParams) {
  const [projectScripts, setProjectScripts] = useState<ProjectScript[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const wasDraggingRef = useRef(false);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptName, setScriptName] = useState("");
  const [scriptCommand, setScriptCommand] = useState("");
  const [editingScriptName, setEditingScriptName] = useState<string | null>(null);

  const [sessionScripts, setSessionScripts] = useState<ProjectScript[]>([]);
  const [isRunningScript, setIsRunningScript] = useState(false);

  const loadProjectScripts = useCallback((projectId: string) => {
    fetch(`/api/projects/${projectId}/scripts`)
      .then((r) => r.json())
      .then((data: ProjectScript[]) => setProjectScripts(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (draggedIndex !== null) {
      wasDraggingRef.current = true;
    } else if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      if (selectedProjectId) {
        fetch(`/api/projects/${selectedProjectId}/scripts`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scripts: projectScripts }),
        }).catch((err) => {
          console.error("Failed to save reordered scripts:", err);
        });
      }
    }
  }, [draggedIndex, projectScripts, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectScripts(selectedProjectId);
    } else {
      setProjectScripts([]);
    }
  }, [selectedProjectId, loadProjectScripts]);

  useEffect(() => {
    if (selectedSessionProjectId) {
      fetch(`/api/projects/${selectedSessionProjectId}/scripts`)
        .then((r) => r.json())
        .then((data: ProjectScript[]) => setSessionScripts(data))
        .catch(() => setSessionScripts([]));
    } else {
      setSessionScripts([]);
    }
  }, [selectedSessionProjectId]);

  const handleSaveScript = async () => {
    if (!selectedProjectId || !scriptName.trim() || !scriptCommand.trim()) return;

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scriptName.trim(),
          command: scriptCommand.trim(),
          oldName: editingScriptName,
        }),
      });
      if (res.ok) {
        setScriptName("");
        setScriptCommand("");
        setEditingScriptName(null);
        setScriptModalOpen(false);
        loadProjectScripts(selectedProjectId);
      } else {
        const data = await res.json();
        setApiError({ title: "Save Script Error", message: data.error || "Failed to save script" });
      }
    } catch (err: any) {
      console.error(err);
      setApiError({ title: "Save Script Error", message: err.message || "An error occurred while saving the script." });
    }
  };

  const handleDeleteScript = async (name: string) => {
    if (!selectedProjectId) return;
    setConfirmDialog({
      message: `Delete script "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(
            `/api/projects/${selectedProjectId}/scripts?name=${encodeURIComponent(name)}`,
            { method: "DELETE" },
          );
          if (res.ok) {
            loadProjectScripts(selectedProjectId);
          } else {
            const data = await res.json();
            setApiError({ title: "Delete Script Error", message: data.error || "Failed to delete script" });
          }
        } catch (err: any) {
          console.error(err);
          setApiError({ title: "Delete Script Error", message: err.message || "An error occurred while deleting the script." });
        }
      },
    });
  };

  const handleCloseScriptModal = () => {
    setScriptName("");
    setScriptCommand("");
    setEditingScriptName(null);
    setScriptModalOpen(false);
  };

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".drag-handle")) return;
    e.preventDefault();
    setDraggedIndex(index);
    const cardElement = e.currentTarget.closest(".script-card") as HTMLElement;
    if (cardElement) cardElement.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggedIndex === null) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const card = element?.closest(".script-card") as HTMLElement;
    if (card) {
      const cardIndexStr = card.getAttribute("data-index");
      if (cardIndexStr !== null) {
        const targetIndex = parseInt(cardIndexStr, 10);
        if (!isNaN(targetIndex) && targetIndex !== draggedIndex) {
          setProjectScripts((prev) => {
            const updated = [...prev];
            const [movedItem] = updated.splice(draggedIndex, 1);
            updated.splice(targetIndex, 0, movedItem);
            return updated;
          });
          setDraggedIndex(targetIndex);
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggedIndex === null) return;
    const cardElement = e.currentTarget.closest(".script-card") as HTMLElement;
    if (cardElement) {
      try {
        cardElement.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture might have already been released */
      }
    }
    setDraggedIndex(null);
  };

  const handleAutoAddScripts = async () => {
    if (!selectedProjectId) return;
    setInfoDialog({
      title: "AI Auto Scripts",
      body: AUTO_SCRIPTS_DIALOG_BODY,
      confirmLabel: "Start Analysis",
      onConfirm: async () => {
        setInfoDialog(null);
        try {
          const res = await fetch(`/api/projects/${selectedProjectId}/auto-scripts`, { method: "POST" });
          if (res.status === 202 || res.ok) {
            const data = await res.json();
            setTaskQueue((prev) => {
              if (prev.some((t) => t.id === data.taskId)) return prev;
              return [
                ...prev,
                {
                  id: data.taskId,
                  type: "agent",
                  name: "Agent: Auto Scripts Analysis",
                  sessionId: "",
                  status: "running",
                  createdAt: Date.now(),
                  messageId: data.messageId,
                  projectId: selectedProjectId || undefined,
                },
              ];
            });
            setToast({
              message: "AI analysis started in the background. Scripts will appear automatically once finished.",
              type: "info",
            });
          } else {
            let errorMessage = "Failed to start AI analysis.";
            try {
              const data = await res.json();
              errorMessage = data.error || errorMessage;
            } catch {
              try {
                const text = await res.text();
                errorMessage = text || errorMessage;
              } catch {}
            }
            setApiError({ title: "AI Analysis Error", message: errorMessage });
          }
        } catch (err: any) {
          console.error(err);
          setApiError({ title: "System Error", message: err.message || String(err) });
        }
      },
    });
  };

  const handleRunScript = async (scriptName: string) => {
    if (!selectedSessionId) return;
    setMenuOpen(false);
    setScriptSubMenuOpen(false);
    setIsRunningScript(true);
    const tempTaskId = `script-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      {
        id: tempTaskId,
        type: "script",
        name: `Script: ${scriptName}`,
        sessionId: selectedSessionId,
        status: "running",
        createdAt: Date.now(),
      },
    ]);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/run-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Run Script Error", message: data.error || "Failed to run script" });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err: any) {
      setApiError({ title: "Run Script Error", message: err.message || "An error occurred while running the script." });
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    } finally {
      setIsRunningScript(false);
    }
  };

  const handleRunGlobalScript = async (scriptName: string) => {
    if (!selectedProjectId) return;
    setMenuOpen(false);
    setScriptSubMenuOpen(false);
    const tempTaskId = `global-script-${selectedProjectId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      {
        id: tempTaskId,
        type: "script",
        name: `Script: ${scriptName}`,
        sessionId: "",
        sessionName: "",
        status: "running",
        createdAt: Date.now(),
      },
    ]);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/run-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptName }),
      });
      if (res.ok) {
        const data = await res.json();
        setTaskQueue((prev) =>
          prev.map((t) =>
            t.id === tempTaskId
              ? { ...t, id: data.taskId, messageId: data.messageId }
              : t
          )
        );
        setToast({ message: `Global script "${scriptName}" started.`, type: "success" });
      } else {
        const data = await res.json();
        setApiError({ title: "Run Global Script Error", message: data.error || "Failed to run global script" });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err: any) {
      setApiError({ title: "Run Global Script Error", message: err.message || "An error occurred while running the global script." });
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    }
  };

  return {
    projectScripts, setProjectScripts,
    draggedIndex,
    scriptModalOpen, setScriptModalOpen,
    scriptName, setScriptName,
    scriptCommand, setScriptCommand,
    editingScriptName, setEditingScriptName,
    sessionScripts,
    isRunningScript,
    loadProjectScripts,
    handleSaveScript,
    handleDeleteScript,
    handleCloseScriptModal,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleAutoAddScripts,
    handleRunScript,
    handleRunGlobalScript,
  };
}
