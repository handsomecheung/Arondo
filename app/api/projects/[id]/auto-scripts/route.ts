import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { exec, spawn } from "child_process";
import { promisify } from "util";

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

async function runAutoScriptsInBackground(projectId: string, repoPath: string) {
  const { addProjectScript } = await import("@/lib/store");
  const path = await import("path");
  const fs = await import("fs/promises");
  const os = await import("os");

  const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  const logDir = DATA_DIR;
  const errorLogPath = path.join(logDir, "auto-script-error.log");

  const timestamp = Date.now();
  const tempJsonPath = path.join(
    os.tmpdir(),
    `auto-scripts-${projectId}-${timestamp}.json`,
  );
  const tempPromptPath = path.join(
    os.tmpdir(),
    `auto-scripts-prompt-${projectId}-${timestamp}.txt`,
  );

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
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
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
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const statusInfo = autoScriptsStatus.get(id) || { status: "idle" };
  return NextResponse.json(statusInfo);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  autoScriptsStatus.set(id, { status: "running" });

  // Fire and forget
  runAutoScriptsInBackground(id, project.repoPath);

  return NextResponse.json(
    {
      success: true,
      message:
        "AI analysis started in the background. Results will automatically appear once finished.",
    },
    { status: 202 },
  );
}

export const dynamic = "force-dynamic";
