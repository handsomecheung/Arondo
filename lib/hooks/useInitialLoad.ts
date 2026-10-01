"use client";

import { useEffect } from "react";
import type { Session, TaskItem } from "@/types/home";
import type { AgentCommand } from "@/lib/agentCommands";
import { sortSessionsForSidebar } from "@/lib/homeUtils";

interface UseInitialLoadParams {
  initUrl: { session: string | null; project: string | null };
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setAgentCommands: (v: AgentCommand[]) => void;
  loadProjects: () => void;
  loadRunners: () => void;
}

export function useInitialLoad({
  initUrl,
  setSessions,
  setSelectedSessionId,
  setTaskQueue,
  setAgentCommands,
  loadProjects,
  loadRunners,
}: UseInitialLoadParams) {
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    let cleanupInteractionListeners: (() => void) | null = null;

    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        if (!Array.isArray(data)) return;
        setSessions(data);
        const urlSession = initUrl.session;
        const urlProject = initUrl.project;
        if (urlSession && data.some((s) => s.id === urlSession)) {
          // URL already set the correct session
        } else if (urlSession) {
          // URL points at a session that no longer exists — show the new-session prompt
          setSelectedSessionId(null);
        } else if (!urlProject && data.length > 0) {
          const sortedData = sortSessionsForSidebar(data);

          const latestSession = sortedData[0];
          const lastUpdatedTime = new Date(latestSession.updatedAt || latestSession.createdAt || 0).getTime();
          const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
          const isWithinTwoDays = (Date.now() - lastUpdatedTime) <= twoDaysInMs;

          if (isWithinTwoDays) {
            let hasInteracted = false;

            const handleInteraction = () => {
              hasInteracted = true;
              if (timerId) {
                clearTimeout(timerId);
                timerId = null;
              }
              cleanup();
            };

            const cleanup = () => {
              window.removeEventListener("mousemove", handleInteraction);
              window.removeEventListener("keydown", handleInteraction);
              window.removeEventListener("mousedown", handleInteraction);
              window.removeEventListener("touchstart", handleInteraction);
              window.removeEventListener("wheel", handleInteraction);
              cleanupInteractionListeners = null;
            };

            window.addEventListener("mousemove", handleInteraction);
            window.addEventListener("keydown", handleInteraction);
            window.addEventListener("mousedown", handleInteraction);
            window.addEventListener("touchstart", handleInteraction);
            window.addEventListener("wheel", handleInteraction);
            cleanupInteractionListeners = cleanup;

            timerId = setTimeout(() => {
              cleanup();
              if (!hasInteracted) {
                setSelectedSessionId(latestSession.id);
              }
            }, 3000);
          }
        }
      })
      .catch(console.error);

    fetch("/api/tasks")
      .then((r) => r.json())
      .then((tasks: any[]) => {
        if (!Array.isArray(tasks)) return;
        const runningTasks = tasks.filter((t) => !t.completedAt);
        const initTasks: TaskItem[] = runningTasks.map((t) => ({
          id: t.taskId,
          type: t.type,
          name: t.type === "agent" || t.type === "detached-agent"
            ? `${t.type === "detached-agent" ? "Separate Agent" : "Agent"}: ${t.command || "Agent Task"}`
            : `Script: ${t.scriptName || t.command || "Script Task"}`,
          sessionId: t.sessionId || "",
          messageId: t.messageId || t.taskId,
          status: "running",
          createdAt: t.createdAt,
          projectId: t.projectId,
          scriptName: t.scriptName,
          command: t.command,
        }));
        setTaskQueue(initTasks);
      })
      .catch(console.error);

    loadProjects();
    loadRunners();

    const runnerPoll = setInterval(loadRunners, 10_000);

    fetch("/api/agent-commands")
      .then((r) => r.json())
      .then((data: AgentCommand[]) => {
        if (Array.isArray(data)) setAgentCommands(data);
      })
      .catch(console.error);

    return () => {
      clearInterval(runnerPoll);
      if (timerId) {
        clearTimeout(timerId);
      }
      if (cleanupInteractionListeners) {
        cleanupInteractionListeners();
      }
    };
  }, [loadProjects, loadRunners]);
}
