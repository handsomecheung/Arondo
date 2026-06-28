"use client";

import { useCallback } from "react";
import type { Session, TaskItem } from "@/types/home";
import { resolveAgentCommand, getUniqueTriggers } from "@/lib/agentCommands";
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
}: UseSessionSubmitParams) {
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    const v = value.trim();
    const agentTriggers = getUniqueTriggers(agentCommands);
    const matchesAgentCmd = agentTriggers.some((t) => v.startsWith("/" + t) || ("/" + t).startsWith(v));
    const matchesCommand = v.startsWith("/new") || "/new".startsWith(v) || matchesAgentCmd;
    setShowCommandMenu(v.startsWith("/") && matchesCommand && !isNewSession && !!selectedSessionId);
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
  }, [prompt, repoPath, agentType, runnerId, isNewSession, selectedSessionId, loadProjects, setTaskQueue, handleNewSessionCommand, sendAgentMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && showCommandMenu) {
      e.preventDefault();
      setShowCommandMenu(false);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return { handlePromptChange, handleNewSessionCommand, handleAgentCommand, handleSubmit, handleKeyDown };
}
