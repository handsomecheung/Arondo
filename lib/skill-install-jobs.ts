import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getConfigDir } from "./config";
import { writeJsonAtomic, withFileLock } from "./fileLock";
import { runnerManager } from "./runner-manager";
import {
  uniqueSkillInstallAgents,
  type SkillInstallInput,
  type SkillInstallJob,
} from "./skills";

const jobsFile = path.join(getConfigDir(), "skill-installations.json");
interface JobState {
  jobs: SkillInstallJob[];
  ready: Promise<void>;
}
const processState = process as typeof process & {
  _skillInstallJobs?: JobState;
};

function state(): JobState {
  if (!processState._skillInstallJobs) {
    const value: JobState = { jobs: [], ready: Promise.resolve() };
    processState._skillInstallJobs = value;
    value.ready = (async () => {
      try {
        value.jobs = JSON.parse(await fs.readFile(jobsFile, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      for (const job of value.jobs) {
        for (const result of job.results) {
          if (result.status === "running") {
            result.status = "failed";
            result.output =
              "Server restarted during installation. The outcome is unknown; check the runner before retrying.";
          }
        }
      }
    })();
  }
  return processState._skillInstallJobs;
}

async function persist() {
  await withFileLock(jobsFile, () => writeJsonAtomic(jobsFile, state().jobs));
}

export async function getSkillInstallJobs() {
  await state().ready;
  return state().jobs;
}

export async function createSkillInstallJob(
  input: SkillInstallInput,
): Promise<SkillInstallJob> {
  await state().ready;
  input = {
    ...input,
    targets: input.targets.map((target) => ({
      ...target,
      agents: uniqueSkillInstallAgents(target.agents),
    })),
  };
  const jobs = state().jobs;
  if (
    jobs.some((job) =>
      job.results.some(
        (result) =>
          result.status === "running" &&
          input.targets.some((target) => target.runnerId === result.runnerId),
      ),
    )
  ) {
    throw new Error(
      "A skill installation is already running on a selected runner.",
    );
  }
  const job: SkillInstallJob = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
    results: input.targets.flatMap((target) =>
      target.agents.map((agent) => ({
        runnerId: target.runnerId,
        runnerName: runnerManager.getRunner(target.runnerId)!.info.name,
        agent,
        status: "running" as const,
        output: "",
      })),
    ),
  };
  jobs.unshift(job);
  state().jobs = jobs.filter(
    (entry, index) =>
      index < 20 || entry.results.some((result) => result.status === "running"),
  );
  await persist();
  void Promise.all(
    input.targets.map(async (target) => {
      const results = job.results.filter(
        (result) => result.runnerId === target.runnerId,
      );
      try {
        const response: {
          results: {
            agent: string;
            status: "success" | "skipped" | "failed";
            output: string;
          }[];
        } = await runnerManager.sendRequest(
          target.runnerId,
          "skills.install",
          {
            source: input.source,
            skill: input.skill,
            replace: input.replace,
            agents: target.agents,
          },
          (target.agents.length * 125 + 10) * 1000,
        );
        for (const result of results) {
          const received = response.results?.find(
            (entry) => entry.agent === result.agent,
          );
          result.status =
            received?.status === "success" || received?.status === "skipped"
              ? received.status
              : "failed";
          result.output =
            received?.output ??
            "Runner returned no installation result for this agent.";
        }
      } catch (error) {
        for (const result of results) {
          result.status = "failed";
          result.output = `${error instanceof Error ? error.message : String(error)}\nThe outcome may be unknown if the runner disconnected or timed out. Check it before retrying.`;
        }
      }
      await persist();
    }),
  ).catch((error) =>
    console.error("Failed to persist skill installation results:", error),
  );
  return job;
}
