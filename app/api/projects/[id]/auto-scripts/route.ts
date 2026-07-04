import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";

const execAsync = promisify(exec);

// Module-level map to track background execution state
const autoScriptsStatus = new Map<
  string,
  { status: "idle" | "running" | "done" | "error"; error?: string }
>();

function parseJsonArray<T>(text: string): T[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```[a-zA-Z0-9]*\n/, "")
      .replace(/\n```$/, "")
      .trim();
  }
  return JSON.parse(cleaned) as T[];
}

async function runAutoScriptsInBackground(
  projectId: string,
  repoPath: string,
  taskId: string,
  messageId: string,
  timestamp: number,
) {
  const { addProjectScript, addMessage, appendSessionLog, updateMessage } = await import("@/lib/store");
  const { eventBus } = await import("@/lib/event-bus");
  const { runnerManager } = await import("@/lib/runner-manager");
  const { getConfigDir } = await import("@/lib/config");
  const path = await import("path");
  const fs = await import("fs/promises");
  const os = await import("os");

  const CONFIG_DIR = getConfigDir();
  const logDir = CONFIG_DIR;
  const errorLogPath = path.join(logDir, "auto-script-error.log");

  const tempJsonPath = path.join(
    os.tmpdir(),
    `auto-scripts-${projectId}-${timestamp}.json`,
  );
  const tempPromptPath = path.join(
    os.tmpdir(),
    `auto-scripts-prompt-${projectId}-${timestamp}.txt`,
  );

  let exitCode = 0;
  let finalError: Error | null = null;

  try {
    const outputJsonPathFormatted = tempJsonPath.replace(/\\/g, "/");
    const promptInstructions = `Analyze the files in the current repository directory, package configurations, or project documentation (such as README.md) to identify ALREADY EXISTING scripts used for "test", "build", and "deploy". 
Do NOT generate or create any new scripts. Only search for and extract the existing commands defined in the project (e.g., npm scripts, makefiles, shell files, configurations, etc.) for testing, building, and deploying.

Requirements:
1. Strictly restrict your search and analysis to the current working directory and its subdirectories. Do NOT search, read, or analyze any parent or upper-level directories outside the current directory.
2. The script "name" MUST be unique. If there are multiple scripts with the same name (for example, in different subdirectories or contexts), you MUST prefix or suffix the script name with the directory name or context to distinguish them (e.g., "frontend-build" vs "backend-build").
3. You MUST write your final output to the file "${outputJsonPathFormatted}" as a raw valid JSON array of objects where each object has "name" (string) and "command" (string). Example format: [{"name": "test", "command": "npm run test"}].
4. Ensure that only the valid JSON array is written to that file, without any markdown formatting wrappers (like \`\`\`json).`;

    await fs.writeFile(tempPromptPath, promptInstructions, "utf-8");

    const args = [
      "--prompt",
      `Read the instruction file at ${tempPromptPath.replace(/\\/g, "/")} and perform the tasks described in it.`,
      "--dangerously-skip-permissions"
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("agy", args, {
        cwd: repoPath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        appendSessionLog("", messageId, text, true, projectId);
        eventBus.publish({
          type: "terminal_output",
          payload: {
            sessionId: "",
            messageId,
            data: text,
          },
        });
      });

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        appendSessionLog("", messageId, text, true, projectId);
        eventBus.publish({
          type: "terminal_output",
          payload: {
            sessionId: "",
            messageId,
            data: text,
          },
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}. Stderr: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });

    interface ProjectScript {
      name: string;
      command: string;
    }

    let scripts: ProjectScript[] = [];
    try {
      const fileContent = await fs.readFile(tempJsonPath, "utf-8");
      scripts = parseJsonArray<ProjectScript>(fileContent);
    } catch (parseError: any) {
      throw new Error(
        `Failed to read or parse the generated JSON file: ${parseError.message}.`,
      );
    }

    for (const script of scripts) {
      if (script.name && script.command) {
        await addProjectScript(projectId, {
          name: script.name.trim(),
          command: script.command.trim(),
        });
      }
    }

    autoScriptsStatus.set(projectId, { status: "done" });
  } catch (error: any) {
    exitCode = 1;
    finalError = error;
    console.error("AI Auto scripts background process failed:", error);
    autoScriptsStatus.set(projectId, {
      status: "error",
      error: error.message || String(error),
    });

    try {
      await fs.mkdir(logDir, { recursive: true });
      const logMessage = `[${new Date().toISOString()}] Project ID: ${projectId} - Error: ${error.message || error}\n`;
      await fs.appendFile(errorLogPath, logMessage, "utf-8");
    } catch (logErr) {
      console.error("Failed to write to error log:", logErr);
    }
  } finally {
    try {
      await fs.unlink(tempPromptPath);
    } catch {}

    try {
      if (exitCode === 0) {
        const agentMsg = await addMessage({
          sessionId: "",
          projectId,
          role: "agent",
          content: "✅ Done! Auto scripts analysis completed successfully.",
          type: "agent-return",
          parentId: messageId,
        });
        eventBus.publish({ type: "message_added", payload: agentMsg });
      } else {
        const errMsg = await addMessage({
          sessionId: "",
          projectId,
          role: "system",
          content: `❌ Error: ${finalError?.message || "Auto scripts analysis failed"}`,
          type: "agent-return",
          parentId: messageId,
        });
        eventBus.publish({ type: "message_added", payload: errMsg });
      }

      eventBus.publish({
        type: "terminal_exit",
        payload: {
          sessionId: "",
          messageId,
          code: exitCode,
        },
      });

      const taskCtx = runnerManager.getTaskContext(taskId);
      if (taskCtx) {
        taskCtx.completedAt = Date.now();
        taskCtx.exitCode = exitCode;
        await updateMessage("", messageId, { exitCode }, projectId);
      }
    } catch (cleanErr) {
      console.error("Error cleaning up task status in finally block:", cleanErr);
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifyProjectPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statusInfo = autoScriptsStatus.get(id) || { status: "idle" };
  return NextResponse.json(statusInfo);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  if (!(await verifyProjectPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { runnerManager } = await import("@/lib/runner-manager");
  const { addMessage, clearSessionLog } = await import("@/lib/store");
  const { eventBus } = await import("@/lib/event-bus");
  const path = await import("path");
  const os = await import("os");

  const runnerId = runnerManager.resolveRunnerId(project.runnerId) || "";
  const timestamp = Date.now();
  const tempPromptPath = path.join(
    os.tmpdir(),
    `auto-scripts-prompt-${id}-${timestamp}.txt`,
  );

  const actualCommand = `agy --prompt "Read the instruction file at ${tempPromptPath.replace(/\\/g, "/")} and perform the tasks described in it." --dangerously-skip-permissions`;

  const promptText = `Analyze the files in the current repository directory, package configurations, or project documentation (such as README.md) to identify ALREADY EXISTING scripts used for "test", "build", and "deploy". 
Do NOT generate or create any new scripts. Only search for and extract the existing commands defined in the project (e.g., npm scripts, makefiles, shell files, configurations, etc.) for testing, building, and deploying.

Requirements:
1. Strictly restrict your search and analysis to the current working directory and its subdirectories. Do NOT search, read, or analyze any parent or upper-level directories outside the current directory.
2. The script "name" MUST be unique. If there are multiple scripts with the same name (for example, in different subdirectories or contexts), you MUST prefix or suffix the script name with the directory name or context to distinguish them (e.g., "frontend-build" vs "backend-build").
3. You MUST write your final output to the file "<temp_json_path>" as a raw valid JSON array of objects where each object has "name" (string) and "command" (string). Example format: [{"name": "test", "command": "npm run test"}].
4. Ensure that only the valid JSON array is written to that file, without any markdown formatting wrappers (like \`\`\`json).`;

  const systemMsg = await addMessage({
    sessionId: "",
    projectId: id,
    role: "system",
    content: `⚙️ Running Auto Scripts Analysis...\n\`\`\`bash\n${actualCommand}\n\`\`\``,
    type: "agent-run",
    command: "Auto Scripts Analysis",
    prompt: promptText,
  });
  eventBus.publish({ type: "message_added", payload: systemMsg });

  const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
  runnerManager.registerTask({
    taskId,
    runnerId,
    sessionId: "",
    messageId: systemMsg.id,
    type: "agent",
    command: actualCommand,
    prompt: promptText,
    scriptName: "Auto Scripts Analysis",
    projectId: id,
    createdAt: Date.now(),
  });

  await clearSessionLog("", systemMsg.id, id);

  autoScriptsStatus.set(id, { status: "running" });

  // Fire and forget
  runAutoScriptsInBackground(id, project.repoPath, taskId, systemMsg.id, timestamp);

  return NextResponse.json(
    {
      success: true,
      taskId,
      messageId: systemMsg.id,
      message:
        "AI analysis started in the background. Results will automatically appear once finished.",
    },
    { status: 202 },
  );
}

export const dynamic = "force-dynamic";
