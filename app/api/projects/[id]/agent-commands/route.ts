import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  mergeAgentCommandLists,
  mergeAgentCommands,
} from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";
import { getConfigDir } from "@/lib/config";
import { withFileLock, writeJsonAtomic } from "@/lib/fileLock";
import { getProject } from "@/lib/store";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

const DEFAULT_COMMANDS_FILE = path.join(getConfigDir(), "agent-commands.json");

async function readDefaultCustomCommands(): Promise<AgentCommand[]> {
  try {
    const raw = await fs.readFile(DEFAULT_COMMANDS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[project-agent-commands] default read failed:", err);
    }
    return [];
  }
}

function getProjectCommandsPath(projectId: string): string {
  return path.join(getConfigDir(), "projects", projectId, "agent-commands.json");
}

async function readProjectCommands(projectId: string): Promise<AgentCommand[]> {
  try {
    const raw = await fs.readFile(getProjectCommandsPath(projectId), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[project-agent-commands] project read failed:", err);
    }
    return [];
  }
}

async function writeProjectCommands(projectId: string, commands: AgentCommand[]): Promise<void> {
  await writeJsonAtomic(getProjectCommandsPath(projectId), commands);
}

async function getAuthorizedProject(id: string, token: string | null) {
  if (!(await verifyProjectPermission(id, token))) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const project = await getProject(id);
  if (!project) {
    return { response: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  }

  return { project };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  const { response } = await getAuthorizedProject(id, token);
  if (response) return response;

  const projectCommands = await readProjectCommands(id);
  if (req.nextUrl.searchParams.get("source") === "custom") {
    return NextResponse.json(projectCommands);
  }

  const defaultCommands = mergeAgentCommands(await readDefaultCustomCommands());
  return NextResponse.json(mergeAgentCommandLists(defaultCommands, projectCommands));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  const { response } = await getAuthorizedProject(id, token);
  if (response) return response;

  const body: AgentCommand = await req.json();
  if (!body.command || !body.send) {
    return NextResponse.json({ error: "command and send are required" }, { status: 400 });
  }

  const filePath = getProjectCommandsPath(id);
  const updated = await withFileLock(filePath, async () => {
    const commands = await readProjectCommands(id);
    const idx = commands.findIndex((c) => c.command === body.command);
    if (idx >= 0) {
      commands[idx] = body;
    } else {
      commands.push(body);
    }
    await writeProjectCommands(id, commands);
    return commands;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getArondoToken(req);
  const { response } = await getAuthorizedProject(id, token);
  if (response) return response;

  const command = req.nextUrl.searchParams.get("command");
  if (!command) {
    return NextResponse.json({ error: "command query param is required" }, { status: 400 });
  }

  const filePath = getProjectCommandsPath(id);
  const updated = await withFileLock(filePath, async () => {
    const commands = await readProjectCommands(id);
    const filtered = commands.filter((c) => c.command !== command);
    await writeProjectCommands(id, filtered);
    return filtered;
  });

  return NextResponse.json(updated);
}
