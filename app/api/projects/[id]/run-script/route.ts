import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectScripts, addMessage, clearSessionLog } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";
import { runnerManager } from "@/lib/runner-manager";
import fs from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { scriptName } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }

  const scripts = await getProjectScripts(projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptName}" not found` }, { status: 404 });
  }

  const runnerId = runnerManager.resolveRunnerId(project.runnerId);
  if (!runnerId) {
    return NextResponse.json({ error: "No connected runner available" }, { status: 503 });
  }

  const systemMsg = await addMessage({
    sessionId: "",
    projectId,
    role: "system",
    content: `⚙️ Running script: **${scriptName}**\n\`\`\`bash\n${script.command}\n\`\`\``,
    type: "script-run",
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: "", // global task
    messageId: systemMsg.id,
    type: "script",
    scriptName,
    command: script.command,
    projectId,
    createdAt: Date.now(),
  });

  await clearSessionLog("", systemMsg.id);

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

      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      const logPath = path.join(dataDir, "global-tasks", "logs", `${systemMsg.id}.log`);
      try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.appendFile(logPath, `\r\n❌ Error: ${errorMessage}\r\n`, "utf-8");
      } catch (e) {
        console.error("Failed to write error log for global task:", e);
      }
    });

  return NextResponse.json({ success: true, taskId });
}

export const dynamic = "force-dynamic";
