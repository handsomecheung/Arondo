import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runnerManager } from "./runner-manager";
import {
  createSkillInstallJob,
  getSkillInstallJobs,
} from "./skill-install-jobs";

const processState = process as typeof process & {
  _skillInstallJobs?: unknown;
};

async function withTempConfigDir(fn: (dir: string) => Promise<void>) {
  const previousDir = process.env.ARONDO_CONFIG_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "arondo-skill-jobs-"));
  process.env.ARONDO_CONFIG_DIR = dir;
  delete processState._skillInstallJobs;
  try {
    await fn(dir);
  } finally {
    delete processState._skillInstallJobs;
    if (previousDir === undefined) delete process.env.ARONDO_CONFIG_DIR;
    else process.env.ARONDO_CONFIG_DIR = previousDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("deletes legacy skill-installations.json and stores each job in its own file", async (t) => {
  await withTempConfigDir(async (dir) => {
    const legacyFile = path.join(dir, "skill-installations.json");
    await fs.writeFile(legacyFile, JSON.stringify([{ id: "legacy-job" }]));

    t.mock.method(runnerManager, "getRunner", () => ({
      info: { name: "Test Runner" },
    }));
    t.mock.method(runnerManager, "sendRequest", async () => ({
      results: [{ agent: "codex", status: "success", output: "installed" }],
    }));

    assert.deepEqual(await getSkillInstallJobs(), []);
    await assert.rejects(fs.stat(legacyFile), { code: "ENOENT" });

    const job = await createSkillInstallJob({
      source: "owner/repo",
      skill: "my-skill",
      replace: false,
      targets: [{ runnerId: "runner-1", agents: ["codex"] }],
    });

    const jobFile = path.join(dir, "skill-installations", `${job.id}.json`);
    const saved = JSON.parse(await fs.readFile(jobFile, "utf8"));
    assert.equal(saved.id, job.id);
    assert.equal(saved.skill, "my-skill");
    await assert.rejects(fs.stat(legacyFile), { code: "ENOENT" });

    // Wait for async runner completion to persist updated status to the job file
    await new Promise((resolve) => setTimeout(resolve, 20));
    const updated = JSON.parse(await fs.readFile(jobFile, "utf8"));
    assert.equal(updated.results[0].status, "success");
    assert.equal(updated.results[0].output, "installed");
  });
});

test("loads jobs newest-first, ignores temp files, and marks interrupted running jobs failed", async () => {
  await withTempConfigDir(async (dir) => {
    const jobsDir = path.join(dir, "skill-installations");
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(
      path.join(jobsDir, ".tmp-leftover.json"),
      "{not-valid-json",
    );
    await fs.writeFile(
      path.join(jobsDir, "older.json"),
      JSON.stringify({
        id: "older",
        source: "owner/repo",
        skill: "old-skill",
        replace: false,
        targets: [{ runnerId: "r1", agents: ["codex"] }],
        createdAt: 100,
        results: [
          {
            runnerId: "r1",
            runnerName: "R1",
            agent: "codex",
            status: "running",
            output: "",
          },
        ],
      }),
    );
    await fs.writeFile(
      path.join(jobsDir, "newer.json"),
      JSON.stringify({
        id: "newer",
        source: "owner/repo",
        skill: "new-skill",
        replace: false,
        targets: [{ runnerId: "r1", agents: ["codex"] }],
        createdAt: 200,
        results: [
          {
            runnerId: "r1",
            runnerName: "R1",
            agent: "codex",
            status: "success",
            output: "ok",
          },
        ],
      }),
    );

    const jobs = await getSkillInstallJobs();
    assert.deepEqual(
      jobs.map((j) => j.id),
      ["newer", "older"],
    );
    assert.equal(jobs[1].results[0].status, "failed");
    assert.match(jobs[1].results[0].output, /Server restarted/);

    const persistedOlder = JSON.parse(
      await fs.readFile(path.join(jobsDir, "older.json"), "utf8"),
    );
    assert.equal(persistedOlder.results[0].status, "failed");
  });
});

test("prunes oldest completed job files beyond 20 retained jobs", async (t) => {
  await withTempConfigDir(async (dir) => {
    const jobsDir = path.join(dir, "skill-installations");
    await fs.mkdir(jobsDir, { recursive: true });
    for (let i = 1; i <= 20; i++) {
      await fs.writeFile(
        path.join(jobsDir, `job-${i}.json`),
        JSON.stringify({
          id: `job-${i}`,
          source: "owner/repo",
          skill: "s",
          replace: false,
          targets: [{ runnerId: "r1", agents: ["codex"] }],
          createdAt: i,
          results: [
            {
              runnerId: "r1",
              runnerName: "R1",
              agent: "codex",
              status: "success",
              output: "ok",
            },
          ],
        }),
      );
    }

    t.mock.method(runnerManager, "getRunner", () => ({
      info: { name: "Test Runner" },
    }));
    t.mock.method(runnerManager, "sendRequest", async () => ({
      results: [{ agent: "codex", status: "success", output: "installed" }],
    }));

    const created = await createSkillInstallJob({
      source: "owner/repo",
      skill: "latest-skill",
      replace: false,
      targets: [{ runnerId: "r1", agents: ["codex"] }],
    });

    const jobs = await getSkillInstallJobs();
    assert.equal(jobs.length, 20);
    assert.equal(jobs[0].id, created.id);
    await assert.rejects(fs.stat(path.join(jobsDir, "job-1.json")), {
      code: "ENOENT",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const remaining = await fs.readdir(jobsDir);
    assert.equal(remaining.length, 20);
  });
});
