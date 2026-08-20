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
  pendingFiles: File[];
  setPendingFiles: (v: File[] | ((prev: File[]) => File[])) => void;
  uploadPendingFile: (file: File, runnerId: string) => Promise<string>;
  draftTrigger: "manual" | "codebaseReady" | "at";
  draftAt: number | null;
  sendScheduledAt: number | null;
  setSendScheduledAt: (v: number | null) => void;
  pendingSendTrigger: "manual" | "codebaseReady" | null;
  setPendingSendTrigger: (v: "manual" | "codebaseReady" | null) => void;
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
  pendingFiles,
  setPendingFiles,
  uploadPendingFile,
  draftTrigger,
  draftAt,
  sendScheduledAt,
  setSendScheduledAt,
  pendingSendTrigger,
  setPendingSendTrigger,
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
    const showMenu = (() => {
      if (value.startsWith("!")) {
        const hasProject = (isNewSession || !selectedSessionId)
          ? (!!repoPath.trim() && !!runnerId)
          : true;
        return hasProject;
      }
      if (v.startsWith("/") && matchesCommand) {
        return !isNewSession && !!selectedSessionId;
      }
      return false;
    })();
    setShowCommandMenu(showMenu);
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
    const detached = promptText.trim().match(/^\/(review|btw)(?:\s+--agent\s+(agy|antigravity|claude|codex|opencode|auto))?(?:\s+([\s\S]*))?$/);
    if (detached && selectedSessionId) {
      const kind = detached[1] as "review" | "btw";
      const requestedAgent = detached[2] === "agy" ? "antigravity" : detached[2];
      const rawMessage = detached[3]?.trim() || "";
      const message = (rawMessage.startsWith('"') && rawMessage.endsWith('"')) ||
        (rawMessage.startsWith("'") && rawMessage.endsWith("'"))
        ? rawMessage.slice(1, -1)
        : rawMessage;
      if (kind === "btw" && !message) {
        setApiError({ title: "Command Error", message: "/btw requires a message" });
        return;
      }
      setPrompt("");
      setShowCommandMenu(false);
      if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
      try {
        const res = await fetch(`/api/sessions/${selectedSessionId}/detached-agent-runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, message, agentType: requestedAgent || selectedSession?.agentType }),
        });
        if (!res.ok) {
          const data = await res.json();
          setApiError({ title: "Command Error", message: data.error || "Failed to start separate agent" });
        }
      } catch (err) {
        console.error(err);
        setApiError({ title: "Command Error", message: "Failed to start separate agent" });
      }
      return;
    }
    const agentMessage = resolveAgentCommand(promptText, agentCommands);
    if (agentMessage === null) return;
    await sendAgentMessage(promptText, agentMessage);
  }, [sendAgentMessage, agentCommands, selectedSessionId, selectedSession, setApiError, setPrompt, setShowCommandMenu, textareaRef]);

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
  const handleScriptCommand = useCallback(async (promptText: string) => {
    const rest = promptText.trim().replace(/^!/, "").trim();
    if (!rest) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });

    if (isNewSession || !selectedSessionId) {
      if (!repoPath.trim() || !runnerId) return;
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "",
            repoPath: repoPath.trim(),
            agentType,
            runnerId,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setApiError({ title: "Session Error", message: data.error || "Failed to create session for running script" });
          return;
        }
        const newSession: Session = await res.json();
        finalizeNewSession(newSession, "", false);

        const match = sessionScripts.find((s) => s.name === rest);
        const scriptName = match ? match.name : rest;

        const tempTaskId = `script-${newSession.id}-${Date.now()}`;
        setTaskQueue((prev) => [
          ...prev,
          {
            id: tempTaskId,
            type: "script",
            name: `Script: ${scriptName}`,
            sessionId: newSession.id,
            status: "running",
            createdAt: Date.now(),
          },
        ]);

        const runRes = await fetch(`/api/sessions/${newSession.id}/run-script`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptName, prompt: promptText }),
        });
        if (!runRes.ok) {
          const data = await runRes.json().catch(() => ({}));
          setApiError({ title: "Run Script Error", message: data.error || "Failed to run script" });
          setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
        }
      } catch (err: any) {
        setApiError({ title: "System Error", message: err.message || String(err) });
      }
    } else {
      const match = sessionScripts.find((s) => s.name === rest);
      onRunScript(match ? match.name : rest, promptText);
    }
  }, [
    isNewSession,
    selectedSessionId,
    repoPath,
    runnerId,
    agentType,
    sessionScripts,
    finalizeNewSession,
    setApiError,
    setTaskQueue,
    onRunScript,
    setPrompt,
    setShowCommandMenu,
    textareaRef,
  ]);



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
    const isBlankSession = (isNewSession || (!selectedSessionId && !isNewDraft)) && !trimmed && pendingFiles.length === 0;

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

    if (prompt.startsWith("!")) {
      const rest = trimmed.slice(1).trim();
      const hasProject = (isNewSession || !selectedSessionId) ? (!!repoPath.trim() && !!runnerId) : true;
      if (rest && hasProject) {
        handleScriptCommand(prompt);
        return;
      }
    }

    if (/^\/(review|btw)(?:\s|$)/.test(trimmed)) {
      await handleAgentCommand(trimmed);
      return;
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
    if (pendingFiles.length > 0) {
      try {
        const uploadedPaths: string[] = [];
        const fileNames: string[] = [];
        for (const file of pendingFiles) {
          const path = await uploadPendingFile(file, targetRunnerId);
          uploadedPaths.push(path);
          fileNames.push(file.name);
        }
        const attachmentNote = fileNames.map((n) => `📎 Uploaded a file: ${n}`).join("\n");
        const pathNote = uploadedPaths.map((p) => `Uploaded file path: ${p}`).join("\n");
        displayMessage = trimmed ? `${trimmed}\n${attachmentNote}` : attachmentNote;
        agentPrompt = trimmed ? `${trimmed}\n\n${pathNote}` : pathNote;
        setPendingFiles([]);
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
        if (isNewDraft && draftTrigger === "at" && !draftAt) {
          setApiError({ title: "Send Error", message: "Choose a date and time for the scheduled send." });
          return;
        }
        if (isNewDraft && draftTrigger === "at" && draftAt && draftAt <= Date.now()) {
          setApiError({ title: "Send Error", message: "The scheduled time must be in the future." });
          return;
        }
        if (!isNewDraft && sendScheduledAt && sendScheduledAt <= Date.now()) {
          setApiError({ title: "Send Error", message: "The scheduled time must be in the future." });
          return;
        }
        const trimmedRepoPath = repoPath.trim();
        const useSchedule = !isNewDraft && !!sendScheduledAt && !!displayMessage;
        const usePendingTrigger = !isNewDraft && !useSchedule && !!pendingSendTrigger && !!displayMessage;
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: agentPrompt,
            message: displayMessage,
            repoPath: trimmedRepoPath,
            agentType,
            runnerId,
            ...(isNewDraft
              ? { isDraft: true, draftTrigger, ...(draftTrigger === "at" ? { draftAt } : {}) }
              : useSchedule
                ? { isDraft: true, draftTrigger: "at", draftAt: sendScheduledAt }
                : usePendingTrigger
                  ? { isDraft: true, draftTrigger: pendingSendTrigger }
                  : {}),
          }),
        });
        if (res.status === 409) {
          const data = await res.json();
          setPendingConfirmation({ rawText: trimmed, displayMessage, agentPrompt, repoPath: trimmedRepoPath, agentType, runnerId, reason: data.reason });
          return;
        }
        const newSession: Session = await res.json();
        if (useSchedule) setSendScheduledAt(null);
        if (usePendingTrigger) setPendingSendTrigger(null);
        finalizeNewSession(newSession, displayMessage, !isBlankSession && !isNewDraft && !useSchedule && !usePendingTrigger);
      } else if (sendScheduledAt || pendingSendTrigger) {
        if (sendScheduledAt && sendScheduledAt <= Date.now()) {
          setApiError({ title: "Send Error", message: "The scheduled time must be in the future." });
          return;
        }
        try {
          const trigger = sendScheduledAt ? { kind: "at" as const, timestamp: sendScheduledAt } : { kind: pendingSendTrigger! };
          const res = await fetch(`/api/sessions/${selectedSessionId}/todo-messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: displayMessage, prompt: agentPrompt, trigger }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setApiError({ title: "Send Error", message: data.error || "Failed to queue message" });
            return;
          }
          setSendScheduledAt(null);
          setPendingSendTrigger(null);
        } catch (err: any) {
          setApiError({ title: "Send Error", message: err.message || "Failed to queue message" });
        }
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
  }, [prompt, repoPath, agentType, runnerId, isNewSession, isNewDraft, pendingFiles, setPendingFiles, uploadPendingFile, draftTrigger, draftAt, sendScheduledAt, setSendScheduledAt, pendingSendTrigger, setPendingSendTrigger, selectedSessionId, selectedSession, loadProjects, setTaskQueue, setApiError, setToast, handleNewSessionCommand, handleRenameSessionCommand, sendAgentMessage, sessionScripts, handleScriptCommand, agentCommands, finalizeNewSession]);

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
