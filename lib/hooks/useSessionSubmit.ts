"use client";

import { useCallback, useState } from "react";
import type { Session, TaskItem, ProjectScript } from "@/types/home";
import { resolveAgentCommand, getUniqueTriggers, getTriggerWord } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";
import { autoResizeTextarea } from "@/lib/homeUtils";

interface UseSessionSubmitParams {
  prompt: string;
  repoPath: string;
  agentType: string;
  runnerId: string;
  isNewSession: boolean;
  isNewDraft: boolean;
  pendingFile: File | null;
  setPendingFile: (v: File | null) => void;
  uploadPendingFile: (file: File, runnerId: string) => Promise<string>;
  draftTrigger: "manual" | "codebaseReady";
  showCommandMenu: boolean;
  selectedSession: Session | null;
  selectedSessionId: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setPrompt: (v: string) => void;
  setShowCommandMenu: (v: boolean) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsNewSession: (v: boolean) => void;
  setIsNewDraft: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setSessionLog: (v: string) => void;
  setActiveLogMsgId: (v: string | null) => void;
  setLogModalOpen: (v: boolean) => void;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setApiError: (v: { title: string; message: string } | null) => void;
  setToast: (v: { message: string; type: "success" | "info" | "error" } | null) => void;
  loadProjects: () => void;
  agentCommands: AgentCommand[];
  sessionScripts: ProjectScript[];
  onRunScript: (name: string, promptText?: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newName: string) => void;
  onTriggerFsModal?: () => void;
}

export function useSessionSubmit({
  prompt,
  repoPath,
  agentType,
  runnerId,
  isNewSession,
  isNewDraft,
  pendingFile,
  setPendingFile,
  uploadPendingFile,
  draftTrigger,
  showCommandMenu,
  selectedSession,
  selectedSessionId,
  textareaRef,
  setPrompt,
  setShowCommandMenu,
  setSessions,
  setSelectedSessionId,
  setIsNewSession,
  setIsNewDraft,
  setMessages,
  setSessionLog,
  setActiveLogMsgId,
  setLogModalOpen,
  setTaskQueue,
  setApiError,
  setToast,
  loadProjects,
  agentCommands,
  sessionScripts,
  onRunScript,
  onDeleteSession,
  onRenameSession,
  onTriggerFsModal,
}: UseSessionSubmitParams) {
  const [commandMenuIndex, setCommandMenuIndex] = useState(-1);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    rawText: string;
    displayMessage: string;
    agentPrompt: string;
    repoPath: string;
    agentType: string;
    runnerId: string;
    reason: { dirty: boolean; busy: boolean; queued?: boolean };
    existingSessionId?: string;
    isFollowup?: boolean;
  } | null>(null);

  const getVisibleMenuItems = useCallback((): string[] => {
    const v = prompt.trim();
    const items: string[] = [];
    if (prompt.startsWith("!")) {
      for (const s of sessionScripts) {
        const trigger = "!" + s.name;
        if (trigger.startsWith(v) || v.startsWith(trigger)) items.push(trigger);
      }
      return items;
    }
    if (("/new").startsWith(v) || v.startsWith("/new")) items.push("/new");
    if (("/delete").startsWith(v) || v.startsWith("/delete")) items.push("/delete");
    if (("/rename").startsWith(v) || v.startsWith("/rename")) items.push("/rename");
    for (const cmd of agentCommands) {
      const trigger = getTriggerWord(cmd);
      const slashTrigger = "/" + trigger;
      const afterSlash = v.slice(1);
      const isBrowsing = slashTrigger.startsWith(v);
      const matches = cmd.matcher ? new RegExp(cmd.matcher).test(afterSlash) : afterSlash === trigger;
      if (isBrowsing || matches) items.push(slashTrigger);
    }
    return items;
  }, [prompt, agentCommands, sessionScripts]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    setCommandMenuIndex(-1);

    // Check if user typed '@'
    const selectionStart = e.target.selectionStart;
    const lastChar = selectionStart > 0 ? value.substring(selectionStart - 1, selectionStart) : "";
    if (lastChar === "@" && onTriggerFsModal) {
      const isStart = selectionStart === 1;
      const charBeforeAt = selectionStart > 1 ? value.substring(selectionStart - 2, selectionStart - 1) : "";
      const isAfterSpace = charBeforeAt === " ";
      const isAfterNewline = charBeforeAt === "\n";
      if (isStart || isAfterSpace || isAfterNewline) {
        if (textareaRef.current) {
          textareaRef.current.blur();
        }
        onTriggerFsModal();
      }
    }

    const v = value.trim();
    const agentTriggers = getUniqueTriggers(agentCommands);
    const matchesAgentCmd = agentTriggers.some((t) => v.startsWith("/" + t) || ("/" + t).startsWith(v));
    const matchesCommand = v.startsWith("/new") || "/new".startsWith(v) || v.startsWith("/delete") || "/delete".startsWith(v) || v.startsWith("/rename") || "/rename".startsWith(v) || matchesAgentCmd;
    const matchesScript = sessionScripts.some((s) => v.startsWith("!" + s.name) || ("!" + s.name).startsWith(v));
    setShowCommandMenu(
      ((v.startsWith("/") && matchesCommand) || (value.startsWith("!") && matchesScript)) &&
        !isNewSession &&
        !!selectedSessionId
    );
    autoResizeTextarea(e.target);
  };

  const handleNewSessionCommand = useCallback(async (sessionName?: string) => {
    if (!selectedSession) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
    const { repoPath: sessionRepoPath, agentType: sessionAgentType, runnerId: sessionRunnerId } = selectedSession;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "",
        repoPath: sessionRepoPath,
        agentType: sessionAgentType,
        runnerId: sessionRunnerId,
        ...(sessionName ? { name: sessionName } : {}),
      }),
    });
    const newSession: Session = await res.json();
    setSessions((prev) => [newSession, ...prev]);
    setSelectedSessionId(newSession.id);
    setIsNewSession(false);
    setMessages([]);
    setSessionLog("");
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    loadProjects();
  }, [selectedSession, loadProjects]);

  const sendAgentMessage = useCallback(async (originalMessage: string, agentMessage: string) => {
    if (!selectedSessionId) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });

    const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      { id: tempTaskId, type: "agent", name: `Agent: ${originalMessage}`, sessionId: selectedSessionId, status: "running", createdAt: Date.now() },
    ]);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: originalMessage, prompt: agentMessage, type: "chat-user" }),
      });
      if (res.status === 409) {
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
        const data = await res.json();
        setPendingConfirmation({
          rawText: originalMessage,
          displayMessage: originalMessage,
          agentPrompt: agentMessage,
          repoPath,
          agentType,
          runnerId,
          reason: data.reason,
          existingSessionId: selectedSessionId,
          isFollowup: !!data.reason?.isFollowup,
        });
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Command Error", message: data.error || "Failed to send command" });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err: any) {
      console.error(err);
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    }
  }, [selectedSessionId, repoPath, agentType, runnerId, setTaskQueue, setApiError]);

  // Called from SessionView with the raw prompt text (e.g. "/commit foo")
  const handleAgentCommand = useCallback(async (promptText: string) => {
    const agentMessage = resolveAgentCommand(promptText, agentCommands);
    if (agentMessage === null) return;
    await sendAgentMessage(promptText, agentMessage);
  }, [sendAgentMessage, agentCommands]);

  // Called from SessionView with the name typed after "/rename". Requires a
  // non-empty name — unlike "/new", renaming to a blank name is not allowed.
  const handleRenameSessionCommand = useCallback((newName: string) => {
    if (!selectedSessionId || !newName.trim()) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
    onRenameSession(selectedSessionId, newName.trim());
  }, [selectedSessionId, onRenameSession]);

  // Called from SessionView with the raw prompt text (e.g. "!build" or "!ls").
  // If the text after "!" matches a predefined script, that script runs; otherwise
  // it's executed as a raw shell command.
  const handleScriptCommand = useCallback((promptText: string) => {
    const rest = promptText.trim().replace(/^!/, "").trim();
    if (!rest) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
    const match = sessionScripts.find((s) => s.name === rest);
    onRunScript(match ? match.name : rest, promptText);
  }, [sessionScripts, onRunScript]);

  // Shared post-creation bookkeeping for a freshly created session, whether
  // it was sent immediately, forced past a confirmation, or created as a draft.
  const finalizeNewSession = useCallback((newSession: Session, trimmedPrompt: string, immediate: boolean) => {
    if (immediate) {
      setTaskQueue((prev) => [
        ...prev,
        { id: `agent-${newSession.id}-${Date.now()}`, type: "agent", name: `Agent: ${trimmedPrompt}`, sessionId: newSession.id, status: "running", createdAt: Date.now() },
      ]);
    }
    setSessions((prev) => [newSession, ...prev]);
    setSelectedSessionId(newSession.id);
    setIsNewSession(false);
    setIsNewDraft(false);
    setSessionLog("");
    setActiveLogMsgId(null);
    setLogModalOpen(false);
    loadProjects();
  }, [setTaskQueue, setSessions, setSelectedSessionId, setIsNewSession, setIsNewDraft, setSessionLog, setActiveLogMsgId, setLogModalOpen, loadProjects]);

  // Resolves the "project not ready" confirmation dialog: send anyway, queue
  // an auto-send draft, or create a manual draft — all reuse the same /api/sessions POST.
  const resolvePendingConfirmation = useCallback(async (choice: "force" | "pendingAuto" | "draft") => {
    if (!pendingConfirmation) return;
    const { displayMessage, agentPrompt, repoPath: pendingRepoPath, agentType: pendingAgentType, runnerId: pendingRunnerId, existingSessionId, isFollowup } = pendingConfirmation;
    setPendingConfirmation(null);

    // First message on an already-created (empty) session: resolve against
    // that session directly instead of going through session creation.
    if (existingSessionId) {
      try {
        if (choice === "force") {
          const tempTaskId = `agent-${existingSessionId}-${Date.now()}`;
          setTaskQueue((prev) => [
            ...prev,
            { id: tempTaskId, type: "agent", name: `Agent: ${displayMessage}`, sessionId: existingSessionId, status: "running", createdAt: Date.now() },
          ]);
          const res = await fetch(`/api/sessions/${existingSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: displayMessage, prompt: agentPrompt, type: "chat-user", force: true }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setApiError({ title: "Send Message Error", message: data.error || "Failed to send message" });
            setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
          }
        } else {
          const autoTriggerKind = isFollowup ? "afterSession" : "codebaseReady";
          const res = await fetch(`/api/sessions/${existingSessionId}/todo-messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: displayMessage,
              prompt: agentPrompt,
              trigger: { kind: choice === "pendingAuto" ? autoTriggerKind : "manual" },
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setApiError({ title: "Send Error", message: data.error || "Failed to queue message" });
            return;
          }
          const autoToast = isFollowup
            ? "Will send automatically once the current run finishes."
            : "Will send automatically once the project is ready.";
          setToast({ message: choice === "pendingAuto" ? autoToast : "Saved as draft — send it manually later.", type: "info" });
        }
      } catch (err: any) {
        setApiError({ title: "Send Error", message: err.message || "Failed to send message" });
      }
      return;
    }

    const body: Record<string, unknown> = { prompt: agentPrompt, message: displayMessage, repoPath: pendingRepoPath, agentType: pendingAgentType, runnerId: pendingRunnerId };
    if (choice === "force") body.force = true;
    else if (choice === "pendingAuto") { body.isDraft = true; body.draftTrigger = "codebaseReady"; }
    else { body.isDraft = true; body.draftTrigger = "manual"; }

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setApiError({ title: "Send Error", message: data.error || "Failed to create session" });
        return;
      }
      const newSession: Session = await res.json();
      finalizeNewSession(newSession, displayMessage, choice === "force");
    } catch (err: any) {
      setApiError({ title: "Send Error", message: err.message || "Failed to create session" });
    }
  }, [pendingConfirmation, finalizeNewSession, setApiError, setTaskQueue, setToast]);

  const cancelPendingConfirmation = useCallback(() => {
    if (!pendingConfirmation) return;
    setPrompt(pendingConfirmation.rawText);
    setPendingConfirmation(null);
  }, [pendingConfirmation, setPrompt]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    const isBlankSession = (isNewSession || (!selectedSessionId && !isNewDraft)) && !trimmed && !pendingFile;

    if (trimmed.startsWith("/new") && !isNewSession && selectedSessionId) {
      const rest = trimmed.slice(4).trim();
      if (trimmed === "/new" || rest) {
        await handleNewSessionCommand(rest || undefined);
        return;
      }
    }

    if (trimmed.startsWith("/rename") && !isNewSession && selectedSessionId) {
      const rest = trimmed.slice("/rename".length).trim();
      if (rest) handleRenameSessionCommand(rest);
      return;
    }

    if (trimmed === "/delete" && !isNewSession && selectedSessionId) {
      setPrompt("");
      setShowCommandMenu(false);
      if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
      onDeleteSession(selectedSessionId);
      return;
    }

    if (prompt.startsWith("!") && !isNewSession && selectedSessionId) {
      const rest = trimmed.slice(1).trim();
      if (rest) {
        handleScriptCommand(trimmed);
        return;
      }
    }

    const agentMsg = resolveAgentCommand(trimmed, agentCommands);
    if (agentMsg !== null && !isNewSession && selectedSessionId) {
      await sendAgentMessage(trimmed, agentMsg);
      return;
    }

    if (!trimmed && !isBlankSession) return;

    const targetRunnerId = (isNewSession || isNewDraft || !selectedSessionId) ? runnerId : (selectedSession?.runnerId ?? runnerId);

    // displayMessage is what's shown in the chat timeline (never reveals the
    // runner-local upload path); agentPrompt is the real instruction sent to
    // the agent, which does include the path so it can read the file.
    let displayMessage = trimmed;
    let agentPrompt = trimmed;
    if (pendingFile) {
      try {
        const path = await uploadPendingFile(pendingFile, targetRunnerId);
        const attachmentNote = `📎 Uploaded a file: ${pendingFile.name}`;
        displayMessage = trimmed ? `${trimmed}\n${attachmentNote}` : attachmentNote;
        agentPrompt = trimmed ? `${trimmed}\n\nUploaded file path: ${path}` : `Uploaded file path: ${path}`;
        setPendingFile(null);
      } catch (err: any) {
        setApiError({ title: "Upload Error", message: err.message || "Failed to upload file" });
        return;
      }
    }

    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });

    try {
      if (isNewSession || isNewDraft || !selectedSessionId) {
        if (!repoPath.trim() || !runnerId) return;
        if (isNewDraft && !displayMessage) return;
        const trimmedRepoPath = repoPath.trim();
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: agentPrompt,
            message: displayMessage,
            repoPath: trimmedRepoPath,
            agentType,
            runnerId,
            ...(isNewDraft ? { isDraft: true, draftTrigger } : {}),
          }),
        });
        if (res.status === 409) {
          const data = await res.json();
          setPendingConfirmation({ rawText: trimmed, displayMessage, agentPrompt, repoPath: trimmedRepoPath, agentType, runnerId, reason: data.reason });
          return;
        }
        const newSession: Session = await res.json();
        finalizeNewSession(newSession, displayMessage, !isBlankSession && !isNewDraft);
      } else {
        const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
        setTaskQueue((prev) => [
          ...prev,
          { id: tempTaskId, type: "agent", name: `Agent: ${displayMessage}`, sessionId: selectedSessionId, status: "running", createdAt: Date.now() },
        ]);
        try {
          const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: displayMessage, prompt: agentPrompt, type: "chat-user" }),
          });
          if (res.status === 409) {
            setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
            const data = await res.json();
            setPendingConfirmation({
              rawText: trimmed,
              displayMessage,
              agentPrompt,
              repoPath,
              agentType,
              runnerId,
              reason: data.reason,
              existingSessionId: selectedSessionId,
              isFollowup: !!data.reason?.isFollowup,
            });
            return;
          }
          if (!res.ok) {
            const data = await res.json();
            setApiError({ title: "Send Message Error", message: data.error || "Failed to send message" });
            setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
          }
        } catch (err: any) {
          console.error(err);
          setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [prompt, repoPath, agentType, runnerId, isNewSession, isNewDraft, pendingFile, setPendingFile, uploadPendingFile, draftTrigger, selectedSessionId, selectedSession, loadProjects, setTaskQueue, setApiError, handleNewSessionCommand, handleRenameSessionCommand, sendAgentMessage, sessionScripts, handleScriptCommand, agentCommands, finalizeNewSession]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && showCommandMenu) {
      e.preventDefault();
      setShowCommandMenu(false);
      setCommandMenuIndex(-1);
      return;
    }
    if (e.key === "Tab" && showCommandMenu) {
      e.preventDefault();
      const items = getVisibleMenuItems();
      if (items.length === 0) return;
      const nextIndex = (commandMenuIndex + 1) % items.length;
      setCommandMenuIndex(nextIndex);
      const completed = items[nextIndex];
      setPrompt(completed + " ");
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        autoResizeTextarea(el);
        el.selectionStart = el.selectionEnd = el.value.length;
      });
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = prompt.slice(0, start) + "\n" + prompt.slice(end);
      setPrompt(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        autoResizeTextarea(textarea);
      });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const isMobile = typeof window !== "undefined" && (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      );
      if (!isMobile) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  return {
    handlePromptChange,
    handleNewSessionCommand,
    handleRenameSessionCommand,
    handleAgentCommand,
    handleScriptCommand,
    handleSubmit,
    handleKeyDown,
    commandMenuIndex,
    pendingConfirmation,
    resolvePendingConfirmation,
    cancelPendingConfirmation,
  };
}
