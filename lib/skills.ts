export const SKILLS_CLI_VERSION = "1.9.0";

export const SKILL_AGENTS = [
  { binary: "codex", id: "codex", name: "Codex" },
  { binary: "claude", id: "claude-code", name: "Claude Code" },
  { binary: "opencode", id: "opencode", name: "OpenCode" },
  { binary: "agy", id: "antigravity-cli", name: "Antigravity CLI" },
  { binary: "pi", id: "pi", name: "Pi" },
] as const;

export const SKILL_INSTALL_GROUPS = [
  {
    id: "shared",
    name: "Codex / OpenCode / Pi",
    agents: ["codex", "opencode", "pi"],
  },
  { id: "claude-code", name: "Claude Code", agents: ["claude-code"] },
  {
    id: "antigravity-cli",
    name: "Antigravity CLI",
    agents: ["antigravity-cli"],
  },
];

export function skillInstallGroup(agent: string) {
  return SKILL_INSTALL_GROUPS.find((group) => group.agents.includes(agent));
}

export function uniqueSkillInstallAgents(agents: string[]) {
  const groups = new Set<string>();
  return agents.filter((agent) => {
    const group = skillInstallGroup(agent)?.id ?? agent;
    if (groups.has(group)) return false;
    groups.add(group);
    return true;
  });
}

export function availableSkillInstallGroups(binaries: string[] = []) {
  return SKILL_INSTALL_GROUPS.flatMap((group) => {
    const agent = SKILL_AGENTS.find(
      (candidate) =>
        group.agents.includes(candidate.id) &&
        binaries.includes(candidate.binary),
    );
    return agent ? [{ ...group, agent: agent.id }] : [];
  });
}

export interface SkillTarget {
  runnerId: string;
  agents: string[];
}

export interface SkillInstallInput {
  source: string;
  skill: string;
  replace: boolean;
  targets: SkillTarget[];
}

export interface SkillInstallResult {
  runnerId: string;
  runnerName: string;
  agent: string;
  status: "running" | "success" | "skipped" | "failed";
  output: string;
}

export interface SkillInstallJob extends SkillInstallInput {
  id: string;
  createdAt: number;
  results: SkillInstallResult[];
}

export function groupSkillInstallResults(results: SkillInstallResult[]) {
  const groups = new Map<string, SkillInstallResult>();
  const priority = { skipped: 0, success: 1, failed: 2, running: 3 };
  for (const result of results) {
    const key = `${result.runnerId}:${skillInstallGroup(result.agent)?.id ?? result.agent}`;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...result });
    } else {
      if (priority[result.status] > priority[previous.status])
        previous.status = result.status;
      if (result.output && !previous.output.includes(result.output))
        previous.output += `\n${result.output}`;
    }
  }
  return [...groups.values()];
}

export function skillInstallError(
  input: SkillInstallInput,
): string | undefined {
  if (
    typeof input.source !== "string" ||
    !input.source.trim() ||
    input.source.length > 2048 ||
    /[\x00-\x1f]/.test(input.source) ||
    input.source.trim().startsWith("-")
  ) {
    return "Enter a repository URL, owner/repo, or an absolute path on the runner.";
  }
  if (
    typeof input.skill !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.skill)
  ) {
    return "Enter the skill name from SKILL.md (letters, numbers, dots, underscores, or hyphens).";
  }
  if (
    typeof input.replace !== "boolean" ||
    !Array.isArray(input.targets) ||
    input.targets.length < 1 ||
    input.targets.length > 50
  ) {
    return "Select at least one runner and agent.";
  }
  const runners = new Set<string>();
  for (const target of input.targets) {
    if (
      !target ||
      typeof target.runnerId !== "string" ||
      runners.has(target.runnerId) ||
      !Array.isArray(target.agents) ||
      !target.agents.length ||
      target.agents.length > SKILL_AGENTS.length ||
      new Set(target.agents).size !== target.agents.length ||
      target.agents.some(
        (agent) => !SKILL_AGENTS.some((candidate) => candidate.id === agent),
      )
    ) {
      return "Invalid or duplicate runner/agent selection.";
    }
    runners.add(target.runnerId);
  }
}
