import { useState, useEffect } from "react";
import type { Project, Runner } from "@/types/home";
import { readSidebarFilterFromUrl, writeSidebarFilterToUrl } from "@/lib/homeUtils";

export function useSidebarFilters(projects: Project[], runners: Runner[]) {
  const [runnerFilter, setRunnerFilter] = useState<string | null>(
    () => readSidebarFilterFromUrl().runner,
  );
  const [projectFilter, setProjectFilter] = useState<string | null>(
    () => readSidebarFilterFromUrl().project,
  );

  useEffect(() => {
    const onPopState = () => {
      const { runner, project } = readSidebarFilterFromUrl();
      setRunnerFilter(runner);
      setProjectFilter(project);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (runnerFilter && runners.length > 0 && !runners.some((r) => r.id === runnerFilter)) {
      setRunnerFilter(null);
    }
  }, [runners, runnerFilter]);

  useEffect(() => {
    if (projectFilter && projects.length > 0 && !projects.some((p) => p.id === projectFilter)) {
      setProjectFilter(null);
    }
  }, [projects, projectFilter]);

  useEffect(() => {
    writeSidebarFilterToUrl({ runner: runnerFilter, project: projectFilter });
  }, [runnerFilter, projectFilter]);

  return { runnerFilter, setRunnerFilter, projectFilter, setProjectFilter };
}
