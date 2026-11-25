import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";
import {
  createSkillInstallJob,
  getSkillInstallJobs,
} from "@/lib/skill-install-jobs";
import {
  SKILL_AGENTS,
  skillInstallError,
  type SkillInstallInput,
} from "@/lib/skills";

export async function GET(request: NextRequest) {
  if (getRoleByToken(getArondoToken(request)) !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }
  return NextResponse.json(await getSkillInstallJobs());
}

export async function POST(request: NextRequest) {
  if (getRoleByToken(getArondoToken(request)) !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }
  let input: SkillInstallInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const error =
    input && typeof input === "object"
      ? skillInstallError(input)
      : "Invalid installation request.";
  if (error) return NextResponse.json({ error }, { status: 400 });
  for (const target of input.targets) {
    const runner = runnerManager.getRunner(target.runnerId)?.info;
    if (!runner?.connected)
      return NextResponse.json(
        {
          error: "A selected runner is disconnected. Refresh the runner list.",
        },
        { status: 409 },
      );
    if (!runner.capabilities.includes("skills.install")) {
      return NextResponse.json(
        {
          error: `Update the runner ${runner.name} to enable skill installation.`,
        },
        { status: 409 },
      );
    }
    for (const agent of target.agents) {
      const binary = SKILL_AGENTS.find(
        (candidate) => candidate.id === agent,
      )!.binary;
      if (!runner.agents.includes(binary)) {
        return NextResponse.json(
          { error: `${agent} is not installed on ${runner.name}.` },
          { status: 400 },
        );
      }
    }
  }
  try {
    const job = await createSkillInstallJob({
      ...input,
      source: input.source.trim(),
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
