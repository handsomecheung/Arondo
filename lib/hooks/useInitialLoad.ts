"use client";

import { useEffect } from "react";
import type { Session, TaskItem } from "@/types/home";
import type { AgentCommand } from "@/lib/agentCommands";

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
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        if (!Array.isArray(data)) return;
        setSessions(data);
        const urlSession = initUrl.session;
        const urlProject = initUrl.project;
        if (urlSession && data.some((s) => s.id === urlSession)) {
          // URL already set the correct session
        } else if (!urlProject && data.length > 0) {
          setSelectedSessionId(data[0].id);
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
          name: t.type === "agent"
            ? t.scriptName === "Auto Scripts Analysis"
              ? "Agent: Auto Scripts Analysis"
              : `Agent: ${t.command || "Agent Task"}`
            : `Script: ${t.scriptName || t.command || "Script Task"}`,
          sessionId: t.sessionId || "",
          messageId: t.messageId || t.taskId,
          status: "running",
          createdAt: t.createdAt,
          projectId: t.projectId,
          scriptName: t.scriptName,
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

    return () => clearInterval(runnerPoll);
  }, [loadProjects, loadRunners]);
}
