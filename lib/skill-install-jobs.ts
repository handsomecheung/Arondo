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

function jobsDir() {
  return path.join(getConfigDir(), "skill-installations");
}

function legacyJobsFile() {
  return path.join(getConfigDir(), "skill-installations.json");
}

function jobFile(id: string) {
  return path.join(jobsDir(), `${id}.json`);
}

interface JobState {
  jobs: SkillInstallJob[];
  ready: Promise<void>;
}
const processState = process as typeof process & {
  _skillInstallJobs?: JobState;
};

async function persistJob(job: SkillInstallJob) {
  const file = jobFile(job.id);
  await withFileLock(file, () => writeJsonAtomic(file, job));
}

function state(): JobState {
  if (!processState._skillInstallJobs) {
    const value: JobState = { jobs: [], ready: Promise.resolve() };
    processState._skillInstallJobs = value;
    value.ready = (async () => {
      await fs.rm(legacyJobsFile(), { force: true });
      let entries: string[] = [];
      try {
        entries = await fs.readdir(jobsDir());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const loaded: SkillInstallJob[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.startsWith(".")) continue;
        const job: SkillInstallJob = JSON.parse(
          await fs.readFile(path.join(jobsDir(), entry), "utf8"),
        );
        let interrupted = false;
        for (const result of job.results) {
          if (result.status === "running") {
            result.status = "failed";
            result.output =
              "Server restarted during installation. The outcome is unknown; check the runner before retrying.";
            interrupted = true;
          }
        }
        if (interrupted) await persistJob(job);
        loaded.push(job);
      }
      loaded.sort((a, b) => b.createdAt - a.createdAt);
      value.jobs = loaded;
    })();
  }
  return processState._skillInstallJobs;
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
  const retained: SkillInstallJob[] = [];
  const pruned: SkillInstallJob[] = [];
  for (const [index, entry] of jobs.entries()) {
    if (index < 20 || entry.results.some((result) => result.status === "running")) {
      retained.push(entry);
    } else {
      pruned.push(entry);
    }
  }
  state().jobs = retained;
  await persistJob(job);
  await Promise.all(
    pruned.map((entry) => fs.rm(jobFile(entry.id), { force: true })),
  );
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
      await persistJob(job);
    }),
  ).catch((error) =>
    console.error("Failed to persist skill installation results:", error),
  );
  return job;
}
