import fs from "fs/promises";
import path from "path";
import { addMessage, clearSessionLog, getProject, recordScriptHistory } from "./store";
import { eventBus } from "./event-bus";
import { runnerManager } from "./runner-manager";
import { getConfigDir } from "./config";
import type { ActionResult } from "./session-actions";

export async function dispatchProjectCommand(
  projectId: string,
  command: string,
  opts: { tokenUuid?: string } = {},
): Promise<ActionResult> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found", status: 404 };

  const runnerId = runnerManager.resolveRunnerId(project.runnerId);
  if (!runnerId) return { ok: false, error: "No connected runner available", status: 503 };

  const systemMsg = await addMessage({
    sessionId: "",
    projectId,
    role: "system",
    content: `⚙️ Running script: **${command}**\n\`\`\`bash\n${command}\n\`\`\``,
    type: "script-run",
    tokenUuid: opts.tokenUuid,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });
  await recordScriptHistory(projectId, command);

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: "",
    messageId: systemMsg.id,
    type: "script",
    scriptName: command,
    command,
    projectId,
    createdAt: Date.now(),
    tokenUuid: opts.tokenUuid,
  });
  await clearSessionLog("", systemMsg.id, projectId);

  runnerManager.sendRequest(runnerId, "exec.script", {
    taskId,
    command,
    workDir: project.repoPath,
    cols: 120,
    rows: 30,
  }, 10_000).then((res: any) => {
    if (res?.pid) runnerManager.updateTaskPid(taskId, res.pid);
  }).catch(async (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorMessageRecord = await addMessage({
      sessionId: "",
      projectId,
      role: "system",
      content: `❌ Error: ${errorMessage}`,
      type: "script-return",
      parentId: systemMsg.id,
    });
    eventBus.publish({ type: "message_added", payload: errorMessageRecord });
    const logPath = path.join(getConfigDir(), "projects", projectId, "logs", `${systemMsg.id}.log`);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `\r\n❌ Error: ${errorMessage}\r\n`, "utf-8");
  });

  return { ok: true, taskId, messageId: systemMsg.id };
}
