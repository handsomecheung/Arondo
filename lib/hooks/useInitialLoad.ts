"use client";

import { useEffect } from "react";
import type { Session, TaskItem } from "@/types/home";

interface UseInitialLoadParams {
  initUrl: { session: string | null; project: string | null };
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setTaskQueue: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  setGithubConfigured: (v: boolean) => void;
  loadProjects: () => void;
  loadRunners: () => void;
}

export function useInitialLoad({
  initUrl,
  setSessions,
  setSelectedSessionId,
  setTaskQueue,
  setGithubConfigured,
  loadProjects,
  loadRunners,
}: UseInitialLoadParams) {
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        setSessions(data);
        const urlSession = initUrl.session;
        const urlProject = initUrl.project;
        if (urlSession && data.some((s) => s.id === urlSession)) {
          // URL already set the correct session
        } else if (!urlProject && data.length > 0) {
          setSelectedSessionId(data[0].id);
        }

        const running = data.filter(
          (s) => s.status === "running" || s.status === "script-running",
        );
        if (running.length > 0) {
          const initTasks: TaskItem[] = [];
          running.forEach((s) => {
            if (s.status === "running") {
              initTasks.push({
                id: `task-${s.id}-init-agent`,
                type: "agent",
                name: `Agent: ${s.prompt}`,
                sessionId: s.id,
                status: "running",
                createdAt: new Date(s.updatedAt || s.createdAt).getTime(),
              });
            }
            if (s.status === "script-running" && s.runningScripts) {
              s.runningScripts.forEach((scriptName, idx) => {
                initTasks.push({
                  id: `task-${s.id}-init-script-${scriptName}-${idx}`,
                  type: "script",
                  name: `Script: ${scriptName}`,
                  sessionId: s.id,
                  status: "running",
                  createdAt: new Date(s.updatedAt || s.createdAt).getTime(),
                });
              });
            }
          });
          setTaskQueue(initTasks);

          running.forEach((s) => {
            if (s.status === "running") {
              fetch(`/api/messages?sessionId=${s.id}`)
                .then((r) => r.json())
                .then((msgs) => {
                  const lastRunMsg = [...msgs]
                    .reverse()
                    .find((m: any) => m.type === "agent-run");
                  if (lastRunMsg) {
                    setTaskQueue((prev) =>
                      prev.map((t) =>
                        t.id === `task-${s.id}-init-agent`
                          ? { ...t, name: `Agent: ${s.prompt}`, messageId: lastRunMsg.id }
                          : t,
                      ),
                    );
                  }
                })
                .catch(console.error);
            } else if (s.status === "script-running" && s.runningScripts) {
              fetch(`/api/messages?sessionId=${s.id}`)
                .then((r) => r.json())
                .then((msgs) => {
                  s.runningScripts?.forEach((scriptName) => {
                    const matchMsg = [...msgs]
                      .reverse()
                      .find(
                        (m: any) =>
                          m.type === "script-run" &&
                          m.content.includes(`Running script: **${scriptName}**`),
                      );
                    if (matchMsg) {
                      setTaskQueue((prev) =>
                        prev.map((t) =>
                          t.id === `task-${s.id}-init-script-${scriptName}`
                            ? { ...t, messageId: matchMsg.id }
                            : t,
                        ),
                      );
                    }
                  });
                })
                .catch(console.error);
            }
          });
        }
      })
      .catch(console.error);

    loadProjects();
    loadRunners();

    const runnerPoll = setInterval(loadRunners, 10_000);

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setGithubConfigured(!!data.githubToken))
      .catch(console.error);

    return () => clearInterval(runnerPoll);
  }, [loadProjects, loadRunners]);
}
