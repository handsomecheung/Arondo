import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { AGENT_COMMANDS, mergeAgentCommands } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";
import { getConfigDir } from "@/lib/config";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";
import { withFileLock, writeJsonAtomic } from "@/lib/fileLock";

export const dynamic = "force-dynamic";

const CONFIG_DIR = getConfigDir();

const COMMANDS_FILE = path.join(CONFIG_DIR, "agent-commands.json");

async function readCustomCommands(): Promise<AgentCommand[]> {
  try {
    const raw = await fs.readFile(COMMANDS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.error("[agent-commands]", err);
    return [];
  }
}

async function writeCustomCommands(commands: AgentCommand[]): Promise<void> {
  await writeJsonAtomic(COMMANDS_FILE, commands);
}

// Serializes the read-modify-write cycle below against itself so concurrent
// POST/DELETE requests can't race into a lost update or a corrupt file.
// `mutator` returns the full command list to persist (in place or a new array).
function updateCustomCommands(
  mutator: (commands: AgentCommand[]) => AgentCommand[]
): Promise<AgentCommand[]> {
  return withFileLock(COMMANDS_FILE, async () => {
    const commands = await readCustomCommands();
    const result = mutator(commands);
    await writeCustomCommands(result);
    return result;
  });
}

export async function GET(req: NextRequest) {
  const token = getArondoToken(req);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = req.nextUrl.searchParams.get("source");
  const custom = await readCustomCommands();
  if (source === "custom") return NextResponse.json(custom);
  return NextResponse.json(mergeAgentCommands(custom));
}

export async function POST(req: NextRequest) {
  const token = getArondoToken(req);
  const role = getRoleByToken(token);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body: AgentCommand = await req.json();
  if (!body.command || !body.send) {
    return NextResponse.json({ error: "command and send are required" }, { status: 400 });
  }
  const custom = await updateCustomCommands((commands) => {
    const idx = commands.findIndex((c) => c.command === body.command);
    if (idx >= 0) {
      commands[idx] = body;
    } else {
      commands.push(body);
    }
    return commands;
  });
  return NextResponse.json(custom);
}

export async function DELETE(req: NextRequest) {
  const token = getArondoToken(req);
  const role = getRoleByToken(token);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const command = req.nextUrl.searchParams.get("command");
  if (!command) {
    return NextResponse.json({ error: "command query param is required" }, { status: 400 });
  }
  const filtered = await updateCustomCommands((commands) =>
    commands.filter((c) => c.command !== command)
  );
  return NextResponse.json(filtered);
}
