"use client";

import { useCallback, useState } from "react";
import type { Session, TaskItem, ProjectScript } from "@/types/home";
import { resolveAgentCommand, getUniqueTriggers, getTriggerWord } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";

interface UseSessionSubmitParams {
  prompt: string;
  repoPath: string;
  agentType: string;
  runnerId: string;
  isNewSession: boolean;
  showCommandMenu: boolean;
  selectedSession: Session | null;
  selectedSessionId: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setPrompt: (v: string) => void;
  setShowCommandMenu: (v: boolean) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsNewSession: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setSessionLog: (v: string) => void;
  setActiveLogMsgId: (v: string | null) => void;
  setLogModalOpen: (v: boolean) => void;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setApiError: (v: { title: string; message: string } | null) => void;
  loadProjects: () => void;
  agentCommands: AgentCommand[];
  sessionScripts: ProjectScript[];
  onRunScript: (name: string) => void;
  onDeleteSession: (id: string) => void;
  onTriggerFsModal?: () => void;
}

export function useSessionSubmit({
  prompt,
  repoPath,
  agentType,
  runnerId,
  isNewSession,
  showCommandMenu,
  selectedSession,
  selectedSessionId,
  textareaRef,
  setPrompt,
  setShowCommandMenu,
  setSessions,
  setSelectedSessionId,
  setIsNewSession,
  setMessages,
  setSessionLog,
  setActiveLogMsgId,
  setLogModalOpen,
  setTaskQueue,
  setApiError,
  loadProjects,
  agentCommands,
  sessionScripts,
  onRunScript,
  onDeleteSession,
  onTriggerFsModal,
}: UseSessionSubmitParams) {
  const [commandMenuIndex, setCommandMenuIndex] = useState(-1);

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
      const isAfterSpace = selectionStart > 1 && value.substring(selectionStart - 2, selectionStart - 1) === " ";
      if (isStart || isAfterSpace) {
        if (textareaRef.current) {
          textareaRef.current.blur();
        }
        onTriggerFsModal();
      }
    }

    const v = value.trim();
    const agentTriggers = getUniqueTriggers(agentCommands);
    const matchesAgentCmd = agentTriggers.some((t) => v.startsWith("/" + t) || ("/" + t).startsWith(v));
    const matchesCommand = v.startsWith("/new") || "/new".startsWith(v) || v.startsWith("/delete") || "/delete".startsWith(v) || matchesAgentCmd;
    const matchesScript = sessionScripts.some((s) => v.startsWith("!" + s.name) || ("!" + s.name).startsWith(v));
    setShowCommandMenu(
      ((v.startsWith("/") && matchesCommand) || (value.startsWith("!") && matchesScript)) &&
        !isNewSession &&
        !!selectedSessionId
    );
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

  const handleNewSessionCommand = useCallback(async (sessionName?: string) => {
    if (!selectedSession) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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

  const sendAgentMessage = useCallback(async (agentMessage: string) => {
    if (!selectedSessionId) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
    setTaskQueue((prev) => [
      ...prev,
      { id: tempTaskId, type: "agent", name: `Agent: ${agentMessage}`, sessionId: selectedSessionId, status: "running", createdAt: Date.now() },
    ]);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: agentMessage, type: "chat-user" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setApiError({ title: "Command Error", message: data.error || "Failed to send command" });
        setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
      }
    } catch (err: any) {
      console.error(err);
      setTaskQueue((prev) => prev.filter((t) => t.id !== tempTaskId));
    }
  }, [selectedSessionId, setTaskQueue]);

  // Called from SessionView with the raw prompt text (e.g. "/commit foo")
  const handleAgentCommand = useCallback(async (promptText: string) => {
    const agentMessage = resolveAgentCommand(promptText, agentCommands);
    if (agentMessage === null) return;
    await sendAgentMessage(agentMessage);
  }, [sendAgentMessage, agentCommands]);

  // Called from SessionView with the raw prompt text (e.g. "!build" or "!ls").
  // If the text after "!" matches a predefined script, that script runs; otherwise
  // it's executed as a raw shell command.
  const handleScriptCommand = useCallback((promptText: string) => {
    const rest = promptText.trim().replace(/^!/, "").trim();
    if (!rest) return;
    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const match = sessionScripts.find((s) => s.name === rest);
    onRunScript(match ? match.name : rest);
  }, [sessionScripts, onRunScript]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    const isBlankSession = (isNewSession || !selectedSessionId) && !trimmed;

    if (trimmed.startsWith("/new") && !isNewSession && selectedSessionId) {
      const rest = trimmed.slice(4).trim();
      if (trimmed === "/new" || rest) {
        await handleNewSessionCommand(rest || undefined);
        return;
      }
    }

    if (trimmed === "/delete" && !isNewSession && selectedSessionId) {
      setPrompt("");
      setShowCommandMenu(false);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
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
      await sendAgentMessage(agentMsg);
      return;
    }

    if (!trimmed && !isBlankSession) return;

    setPrompt("");
    setShowCommandMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      if (isNewSession || !selectedSessionId) {
        if (!repoPath.trim() || !runnerId) return;
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, repoPath: repoPath.trim(), agentType, runnerId }),
        });
        const newSession: Session = await res.json();
        if (!isBlankSession) {
          setTaskQueue((prev) => [
            ...prev,
            { id: `agent-${newSession.id}-${Date.now()}`, type: "agent", name: `Agent: ${trimmed}`, sessionId: newSession.id, status: "running", createdAt: Date.now() },
          ]);
        }
        setSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.id);
        setIsNewSession(false);
        setSessionLog("");
        setActiveLogMsgId(null);
        setLogModalOpen(false);
        loadProjects();
      } else {
        const tempTaskId = `agent-${selectedSessionId}-${Date.now()}`;
        setTaskQueue((prev) => [
          ...prev,
          { id: tempTaskId, type: "agent", name: `Agent: ${trimmed}`, sessionId: selectedSessionId, status: "running", createdAt: Date.now() },
        ]);
        try {
          const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed, type: "chat-user" }),
          });
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
  }, [prompt, repoPath, agentType, runnerId, isNewSession, selectedSessionId, loadProjects, setTaskQueue, handleNewSessionCommand, sendAgentMessage, sessionScripts, handleScriptCommand, agentCommands]);

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
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
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
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
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

  return { handlePromptChange, handleNewSessionCommand, handleAgentCommand, handleScriptCommand, handleSubmit, handleKeyDown, commandMenuIndex };
}
