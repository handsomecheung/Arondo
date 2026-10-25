import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";
import { getProjects } from "@/lib/store";
import { mergeAgentCommandLists, mergeAgentCommands, resolveAgentCommand, type AgentCommand } from "@/lib/agentCommands";

async function readCommands(filePath: string): Promise<AgentCommand[]> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function resolveStoredAgentCommand(
  message: string,
  runnerId: string,
  repoPath: string,
  projectId?: string,
): Promise<string | null> {
  if (!message.trim().startsWith("/")) return null;

  const configDir = getConfigDir();
  const defaults = mergeAgentCommands(await readCommands(path.join(configDir, "agent-commands.json")));
  const project = projectId
    ? { id: projectId }
    : (await getProjects()).find((candidate) =>
        candidate.runnerId === runnerId && path.resolve(candidate.repoPath) === path.resolve(repoPath));
  const commands = project
    ? mergeAgentCommandLists(defaults, await readCommands(path.join(configDir, "projects", project.id, "agent-commands.json")))
    : defaults;
  return resolveAgentCommand(message, commands);
}
