import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import { once } from "events";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { SKILLS_CLI_VERSION } from "../../lib/skills";

const headers = { "x-arondo-token": "test-token-123456" };
let directory: string;
let runnerId: string;
let tokenId: string;
let runner: ChildProcess;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(async ({ request }) => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "arondo-skills-integration-"),
  );
  const bin = path.join(directory, "bin");
  const home = path.join(directory, "home");
  await fs.mkdir(bin);
  await fs.mkdir(home);
  await fs.symlink(process.execPath, path.join(bin, "node"));
  await fs.symlink("/bin/bash", path.join(bin, "bash"));
  for (const binary of ["codex", "claude", "opencode", "pi", "agy"]) {
    await fs.writeFile(
      path.join(bin, binary),
      "#!/usr/bin/env bash\nexit 0\n",
      { mode: 0o755 },
    );
  }
  await fs.writeFile(
    path.join(bin, "npx"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const agent = args[args.indexOf('--agent') + 1];
const skill = args[args.indexOf('--rename') + 1];
fs.appendFileSync(path.join(process.env.HOME, 'calls.jsonl'), JSON.stringify(args) + '\\n');
setTimeout(() => {
  const marker = path.join(process.env.HOME, 'claude-attempted');
  if (agent === 'claude-code' && !fs.existsSync(marker)) {
    fs.writeFileSync(marker, 'failed once');
    console.error('Fixture: Claude installation failed');
    process.exit(1);
  }
  const destination = path.join(process.env.HOME, '.agents', 'skills', skill);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'SKILL.md'), 'fixture installed');
  const agentDirectory = agent === 'claude-code' ? path.join(process.env.HOME, '.claude', 'skills') : agent === 'antigravity-cli' ? path.join(process.env.HOME, '.gemini', 'config', 'skills') : null;
  if (agentDirectory) {
    fs.mkdirSync(agentDirectory, { recursive: true });
    const link = path.join(agentDirectory, skill);
    if (!fs.existsSync(link)) fs.symlinkSync(destination, link, 'dir');
  }
  console.log(JSON.stringify([{ name: skill, status: 'installed', path: destination }]));
}, 700);
`,
    { mode: 0o755 },
  );
  const response = await request.post("/api/auth/runner-tokens", {
    headers,
    data: { name: "Skills integration runner" },
  });
  expect(response.ok()).toBeTruthy();
  const token = await response.json();
  tokenId = token.id;
  runner = spawn(
    path.resolve("runner/arondo-runner"),
    ["--server", "ws://localhost:3252/runner", "--token", token.token],
    {
      env: {
        ...process.env,
        PATH: bin,
        HOME: home,
        CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
        XDG_CONFIG_HOME: path.join(home, ".config"),
      },
      stdio: "ignore",
    },
  );
  await expect
    .poll(async () => {
      const response = await request.get("/api/runners", { headers });
      const found = (await response.json()).find(
        (entry: { runnerTokenId: string }) => entry.runnerTokenId === tokenId,
      );
      runnerId = found?.id;
      return found?.agents;
    })
    .toEqual(
      expect.arrayContaining(["codex", "claude", "opencode", "pi", "agy"]),
    );
});

test.afterAll(async ({ request }) => {
  if (runner && runner.exitCode === null && runner.signalCode === null) {
    const exited = once(runner, "exit");
    runner.kill("SIGTERM");
    await exited;
  }
  if (tokenId)
    await request.delete(`/api/auth/runner-tokens?id=${tokenId}`, { headers });
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

test("skill installation is admin-only and validates targets and source before dispatch", async ({
  request,
}) => {
  const input = {
    source: "owner/repo",
    skill: "opendesign",
    replace: false,
    targets: [{ runnerId, agents: ["codex"] }],
  };
  for (const token of ["test-user-token-7890", "invalid"]) {
    const unauthorized = { "x-arondo-token": token };
    expect(
      (
        await request.get("/api/skills/install", { headers: unauthorized })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/skills/install", {
          headers: unauthorized,
          data: input,
        })
      ).status(),
    ).toBe(403);
  }
  for (const data of [
    null,
    {},
    { ...input, source: "--all" },
    { ...input, skill: "../escape" },
    { ...input, skill: "*" },
    { ...input, targets: [] },
    { ...input, targets: [{ runnerId, agents: ["codex", "codex"] }] },
    { ...input, targets: [{ runnerId, agents: ["unsupported"] }] },
  ]) {
    expect(
      (await request.post("/api/skills/install", { headers, data })).status(),
    ).toBe(400);
  }
  expect(
    (
      await request.post("/api/skills/install", {
        headers,
        data: {
          ...input,
          targets: [{ runnerId: "disconnected", agents: ["codex"] }],
        },
      })
    ).status(),
  ).toBe(409);
});

test("mobile UI installs once per location, retains partial results, and skips repeated installations", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("arondo_token", "test-token-123456"),
  );
  await page.goto("/admin/settings");
  await page.getByRole("link", { name: /^Skills / }).click();
  await expect(
    page.getByRole("heading", { name: "Skills", exact: true }),
  ).toBeVisible();
  const group = page.getByRole("group", { name: /^Skills integration runner/ });
  await expect(
    group.getByRole("checkbox", { name: "Codex / OpenCode / Pi", exact: true }),
  ).toBeChecked();
  await expect(
    group.getByRole("checkbox", { name: /^(Codex|OpenCode|Pi)$/ }),
  ).toHaveCount(0);
  await expect(group.getByRole("checkbox")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Install to 3 locations", exact: true }),
  ).toBeVisible();
  await expect(
    group.getByRole("checkbox", { name: "Claude Code", exact: true }),
  ).toBeChecked();
  const source = `/local source/$(touch injected);OpenDesign`;
  await page.getByRole("textbox", { name: "Skill source" }).fill(source);
  await page.getByRole("textbox", { name: "Skill name" }).fill("OpenDesign");
  await page.getByRole("button", { name: /^Install to/ }).click();
  await expect(page.getByRole("status")).toContainText("Installation started");
  const initial = (
    await (await request.get("/api/skills/install", { headers })).json()
  )[0];
  expect(
    initial.results.map((entry: { status: string }) => entry.status),
  ).toContain("running");
  const duplicate = await request.post("/api/skills/install", {
    headers,
    data: {
      source,
      skill: "OpenDesign",
      replace: false,
      targets: [{ runnerId, agents: ["codex"] }],
    },
  });
  expect(duplicate.status()).toBe(409);
  const listing = await request.get(
    `/api/fs?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(path.join(directory, "home"))}`,
    { headers },
  );
  expect(listing.ok()).toBeTruthy();
  const history = page.getByRole("region", { name: "Installation history" });
  await expect(history.getByText("Installed", { exact: true })).toHaveCount(2);
  await expect(history.getByText("Failed", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(history.getByText("Installed", { exact: true })).toHaveCount(2);
  await history
    .locator("li")
    .filter({ hasText: "Claude Code" })
    .getByText("Installation log", { exact: true })
    .click();
  await expect(history).toContainText("Fixture: Claude installation failed");
  await history.getByRole("button", { name: "Select failed targets" }).click();
  await expect(
    group.getByRole("checkbox", { name: "Codex / OpenCode / Pi", exact: true }),
  ).not.toBeChecked();
  await expect(
    group.getByRole("checkbox", { name: "Claude Code", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Replace existing skill", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Install to 1 location", exact: true })
    .click();
  await expect(history.getByText("Installed", { exact: true })).toHaveCount(3);
  const calls = (
    await fs.readFile(path.join(directory, "home", "calls.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
  expect(calls.map((args) => args[args.indexOf("--agent") + 1])).toEqual([
    "codex",
    "claude-code",
    "antigravity-cli",
    "claude-code",
  ]);
  expect(
    calls.every(
      (args) =>
        args[1] === `skills@${SKILLS_CLI_VERSION}` && args[3] === source,
    ),
  ).toBe(true);
  await group
    .getByRole("checkbox", { name: "All agents on Skills integration runner" })
    .check();
  await page
    .getByRole("checkbox", { name: "Replace existing skill", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Install to 3 locations", exact: true })
    .click();
  const latest = history.locator("article").first();
  await expect(latest.getByText("Skipped", { exact: true })).toHaveCount(3);
  await expect(latest.getByText("Failed", { exact: true })).toHaveCount(0);
  await expect(
    latest.getByRole("button", { name: "Select failed targets" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    history.locator("article").first().getByText("Skipped", { exact: true }),
  ).toHaveCount(3);
  expect(
    (await fs.readFile(path.join(directory, "home", "calls.jsonl"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(4);
  const deduplicated = await request.post("/api/skills/install", {
    headers,
    data: {
      source,
      skill: "OpenDesign",
      replace: false,
      targets: [{ runnerId, agents: ["codex", "opencode", "pi"] }],
    },
  });
  expect(deduplicated.status()).toBe(202);
  expect((await deduplicated.json()).results).toHaveLength(1);
  await expect
    .poll(async () => {
      const jobs = await (
        await request.get("/api/skills/install", { headers })
      ).json();
      return jobs[0].results.map((result: { status: string }) => result.status);
    })
    .toEqual(["skipped"]);
  await expect(
    fs.stat(path.join(directory, "home", "injected")),
  ).rejects.toThrow();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("defaults to one compatible runner and keeps target edits local until installation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("arondo_token", "test-token-123456"),
  );
  const writes: unknown[] = [];
  await page.route("**/api/runners", (route) =>
    route.fulfill({
      json: [
        {
          id: "first",
          name: "Recent runner",
          hostname: "first",
          connected: true,
          capabilities: ["skills.install"],
          agents: ["codex", "claude"],
        },
        {
          id: "second",
          name: "Other runner",
          hostname: "second",
          connected: true,
          capabilities: ["skills.install"],
          agents: ["opencode", "pi"],
        },
        {
          id: "old",
          name: "Old runner",
          hostname: "old",
          connected: true,
          capabilities: [],
          agents: ["codex"],
        },
        {
          id: "offline",
          name: "Offline runner",
          hostname: "offline",
          connected: false,
          capabilities: ["skills.install"],
          agents: ["codex"],
        },
      ],
    }),
  );
  await page.route("**/api/skills/install", (route) => {
    if (route.request().method() === "POST")
      writes.push(route.request().postDataJSON());
    return route.fulfill({
      json: [
        {
          id: "older-installation",
          source: "owner/repo",
          skill: "existing-skill",
          replace: false,
          targets: [],
          createdAt: 0,
          results: ["codex", "opencode", "pi"].map((agent) => ({
            runnerId: "first",
            runnerName: "Recent runner",
            agent,
            status: "success",
            output: "Installed shared skill",
          })),
        },
      ],
    });
  });
  await page.goto("/admin/settings/skills");
  await expect(
    page.getByRole("checkbox", { name: "All agents on Recent runner" }),
  ).toBeChecked();
  await expect(
    page
      .getByRole("region", { name: "Installation history" })
      .getByText("Installed", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Installation history" })
      .getByText("Recent runner · Codex / OpenCode / Pi", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: "All agents on Other runner" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "All agents on Old runner" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "All agents on Offline runner" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "All agents on Other runner" })
    .check();
  await expect(
    page.getByRole("button", { name: "Install to 3 locations", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh runners" }).click();
  await expect(
    page.getByRole("checkbox", { name: "All agents on Other runner" }),
  ).toBeChecked();
  await page
    .getByRole("textbox", { name: "Skill source" })
    .fill("owner/OpenDesign");
  await page.getByRole("textbox", { name: "Skill name" }).fill("opendesign");
  await page.screenshot({
    path: test.info().outputPath("skills-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  expect(writes).toEqual([]);
});
