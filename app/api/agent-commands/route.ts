import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { AGENT_COMMANDS, mergeAgentCommands } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";
import { getConfigDir } from "@/lib/config";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";

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
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(COMMANDS_FILE, JSON.stringify(commands, null, 2));
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
  const custom = await readCustomCommands();
  const idx = custom.findIndex((c) => c.command === body.command);
  if (idx >= 0) {
    custom[idx] = body;
  } else {
    custom.push(body);
  }
  await writeCustomCommands(custom);
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
  const custom = await readCustomCommands();
  const filtered = custom.filter((c) => c.command !== command);
  await writeCustomCommands(filtered);
  return NextResponse.json(filtered);
}
