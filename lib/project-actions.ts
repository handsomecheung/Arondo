import { getProject, getProjectScripts, addMessage, clearSessionLog } from "./store";
import { eventBus } from "./event-bus";
import { runnerManager } from "./runner-manager";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "./config";
import type { ActionResult } from "./session-actions";

/**
 * Runs a project script globally (no session context).
 * Shared by the /projects/[id]/run-script API route and the scheduler ('at' trigger).
 */
export async function dispatchProjectScript(
  projectId: string,
  scriptName: string,
  opts: { tokenUuid?: string } = {},
): Promise<ActionResult> {
  const project = await getProject(projectId);
  if (!project) {
    return { ok: false, error: "Project not found", status: 404 };
  }

  const scripts = await getProjectScripts(projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return { ok: false, error: `Script "${scriptName}" not found`, status: 404 };
  }

  const runnerId = runnerManager.resolveRunnerId(project.runnerId);
  if (!runnerId) {
    return { ok: false, error: "No connected runner available", status: 503 };
  }

  const systemMsg = await addMessage({
    sessionId: "",
    projectId,
    role: "system",
    content: `⚙️ Running script: **${scriptName}**\n\`\`\`bash\n${script.command}\n\`\`\``,
    type: "script-run",
    tokenUuid: opts.tokenUuid,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: "",
    messageId: systemMsg.id,
    type: "script",
    scriptName,
    command: script.command,
    projectId,
    createdAt: Date.now(),
  });

  await clearSessionLog("", systemMsg.id, projectId);

  runnerManager
    .sendRequest(runnerId, "exec.script", {
      taskId,
      command: script.command,
      workDir: project.repoPath,
      cols: 120,
      rows: 30,
    }, 10_000)
    .then((res: any) => {
      if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
    })
    .catch(async (err) => {
      console.error("Failed to execute global script:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      const errMsg = await addMessage({
        sessionId: "",
        projectId,
        role: "system",
        content: `❌ Error: ${errorMessage}`,
        type: "script-return",
        parentId: systemMsg.id,
      });
      eventBus.publish({ type: "message_added", payload: errMsg });

      const dataDir = getConfigDir();
      const logPath = path.join(dataDir, "projects", projectId, "logs", `${systemMsg.id}.log`);
      try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.appendFile(logPath, `\r\n❌ Error: ${errorMessage}\r\n`, "utf-8");
      } catch (e) {
        console.error("Failed to write error log for global task:", e);
      }
    });

  return { ok: true, taskId, messageId: systemMsg.id };
}
