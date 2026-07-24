import { getSessions } from "./store";
import { runnerManager } from "./runner-manager";

export type ProjectReadiness = { dirty: boolean; busy: boolean };

/**
 * A project (runnerId + repoPath) is "ready" once no agent is actively
 * running against it and the working tree has no uncommitted changes.
 * Running scripts don't count as busy. Shared by the scheduler's
 * codebaseReady trigger and the New Session pre-send confirmation check.
 */
export async function getProjectReadiness(runnerId: string, repoPath: string): Promise<ProjectReadiness> {
  const sessions = await getSessions();
  const busy = sessions.some(
    (s) => s.runnerId === runnerId && s.repoPath === repoPath && s.status === "running",
  );

  const connectedRunnerId = runnerManager.resolveRunnerId(runnerId);
  if (!connectedRunnerId) {
    // Can't verify git status without a connected runner — treat as dirty (not ready).
    return { dirty: true, busy };
  }
  const result = await runnerManager.sendRequest(connectedRunnerId, "git.status", { workDir: repoPath });
  return { dirty: !!result.hasChanges, busy };
}
