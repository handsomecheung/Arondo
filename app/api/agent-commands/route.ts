import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { AGENT_COMMANDS, mergeAgentCommands } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";

export const dynamic = "force-dynamic";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

export async function GET() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "agent-commands.json"), "utf-8");
    const custom: AgentCommand[] = JSON.parse(raw);
    return NextResponse.json(mergeAgentCommands(custom));
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.error("[agent-commands]", err);
    return NextResponse.json(AGENT_COMMANDS);
  }
}
