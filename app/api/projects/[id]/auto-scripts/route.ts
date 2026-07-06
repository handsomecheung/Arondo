import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";
import { PROMPT_ENV_VAR } from "@/lib/agents/base";

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

// Polls the task context until the runner reports exec.exit, since exec runs
// on the (possibly remote) runner and only streams back over the WS protocol.
async function waitForTaskExit(taskId: string, pollMs = 500): Promise<number> {
  const { runnerManager } = await import("@/lib/runner-manager");
  for (;;) {
    const ctx = runnerManager.getTaskContext(taskId);
    if (ctx?.completedAt !== undefined) return ctx.exitCode ?? -1;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function runAutoScriptsInBackground(
  projectId: string,
  repoPath: string,
  runnerId: string,
  taskId: string,
  messageId: string,
  timestamp: number,
) {
  const { addProjectScript, addMessage } = await import("@/lib/store");
  const { eventBus } = await import("@/lib/event-bus");
  const { runnerManager } = await import("@/lib/runner-manager");

  // Written by the agent on the runner's filesystem, inside the repo it's
  // already scoped to — the server may not share a filesystem with the runner.
  const normalizedRepoPath = repoPath.replace(/\\/g, "/");
  const outputJsonPath = `${normalizedRepoPath}/.arondo-auto-scripts-${timestamp}.json`;

  let exitCode = 0;
  let finalError: Error | null = null;

  try {
    const promptInstructions = `Analyze the files in the current repository directory, package configurations, or project documentation (such as README.md) to identify ALREADY EXISTING scripts used for "test", "build", and "deploy".
Do NOT generate or create any new scripts. Only search for and extract the existing commands defined in the project (e.g., npm scripts, makefiles, shell files, configurations, etc.) for testing, building, and deploying.

Requirements:
1. Strictly restrict your search and analysis to the current working directory and its subdirectories. Do NOT search, read, or analyze any parent or upper-level directories outside the current directory.
2. The script "name" MUST be unique. If there are multiple scripts with the same name (for example, in different subdirectories or contexts), you MUST prefix or suffix the script name with the directory name or context to distinguish them (e.g., "frontend-build" vs "backend-build").
3. You MUST write your final output to the file "${outputJsonPath}" as a raw valid JSON array of objects where each object has "name" (string) and "command" (string). Example format: [{"name": "test", "command": "npm run test"}].
4. Ensure that only the valid JSON array is written to that file, without any markdown formatting wrappers (like \`\`\`json).`;

    const command = `agy --prompt "$(< "$${PROMPT_ENV_VAR}")" --dangerously-skip-permissions`;

    await runnerManager.sendRequest(
      runnerId,
      "exec.agent",
      {
        taskId,
        command,
        workDir: repoPath,
        prompt: promptInstructions,
        promptEnvVar: PROMPT_ENV_VAR,
      },
      10_000,
    );

    exitCode = await waitForTaskExit(taskId);
    if (exitCode !== 0) {
      throw new Error(`Process exited with code ${exitCode}`);
    }

    interface ProjectScript {
      name: string;
      command: string;
    }

    let scripts: ProjectScript[] = [];
    try {
      const fileResult = await runnerManager.sendRequest(runnerId, "fs.read", {
        path: outputJsonPath,
      });
      scripts = parseJsonArray<ProjectScript>(fileResult.content);
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
    exitCode = exitCode || 1;
    finalError = error;
    console.error("AI Auto scripts background process failed:", error);
    autoScriptsStatus.set(projectId, {
      status: "error",
      error: error.message || String(error),
    });
  } finally {
    // Best-effort cleanup of the temp output file left in the repo on the runner.
    runnerManager
      .sendRequest(
        runnerId,
        "exec.script",
        {
          taskId: `task_${crypto.randomUUID().slice(0, 8)}`,
          command: `rm -f "${outputJsonPath}"`,
          workDir: repoPath,
        },
        5_000,
      )
      .catch(() => {});

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

  const runnerId = runnerManager.resolveRunnerId(project.runnerId) || "";
  if (!runnerId || !runnerManager.getRunner(runnerId)) {
    return NextResponse.json(
      { error: "Runner not found or disconnected" },
      { status: 503 },
    );
  }

  const timestamp = Date.now();
  const actualCommand = `agy --prompt "$(< "$${PROMPT_ENV_VAR}")" --dangerously-skip-permissions`;

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
  await runnerManager.registerTask({
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
  runAutoScriptsInBackground(id, project.repoPath, runnerId, taskId, systemMsg.id, timestamp);

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
