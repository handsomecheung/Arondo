import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

test.describe("Gen Main Agent integration tests", () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;
  let runnerToken: string;
  const adminHeaders = { "x-arondo-token": "test-token-123456" };

  test.beforeAll(async ({ request }) => {
    const tokenRes = await request.post("/api/auth/runner-tokens", {
      headers: adminHeaders,
      data: { name: "Test Gen Runner" },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const tokenBody = await tokenRes.json();
    runnerToken = tokenBody.token;

    const runnerBinary = path.resolve(__dirname, "../../runner/arondo-runner");
    const mockBinDir = await fs.mkdtemp(path.join(os.tmpdir(), "arondo-gen-mock-bin-"));
    for (const binName of ["agy", "claude", "codex", "opencode", "pi"]) {
      const mockPath = path.join(mockBinDir, binName);
      await fs.writeFile(
        mockPath,
        "#!/usr/bin/env bash\necho \"Sub-agent executed task successfully\"\nexit 0\n",
        { mode: 0o755 },
      );
    }

    runnerProcess = spawn(
      runnerBinary,
      ["--server", "ws://localhost:3252/runner", "--token", runnerToken],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `${mockBinDir}:${process.env.PATH || ""}`,
        },
      },
    );

    for (let i = 0; i < 20; i++) {
      const response = await request.get("/api/runners", { headers: adminHeaders });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === "Test Gen Runner" && r.connected);
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    expect(runnerId).toBeTruthy();
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      runnerProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        runnerProcess.on("exit", () => resolve());
      });
    }
  });

  test("delegates task to sub-agent under ${ARONDO_CONFIG_DIR}/gen and posts completion reply", async ({
    request,
  }) => {
    const testConfigDir = path.join(os.tmpdir(), "arondo-test-config");
    const genDir = path.join(testConfigDir, "gen");
    await fs.rm(genDir, { recursive: true, force: true });

    const postRes = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: "Run with no project: summarize system status" },
    });
    expect(postRes.ok()).toBeTruthy();
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(postData.genMessage?.subAgent?.subSessionId).toMatch(/^gen-sub-/);

    const subSessionId: string = postData.genMessage.subAgent.subSessionId;

    async function findSubSessionFile(subId: string, filename: string): Promise<string> {
      const clientDirs = await fs.readdir(genDir);
      for (const cd of clientDirs) {
        const candidate = path.join(genDir, cd, "sessions", subId, filename);
        try {
          await fs.stat(candidate);
          return candidate;
        } catch {}
      }
      return path.join(genDir, "sessions", subId, filename);
    }

    // Sub-agent session files must live inside ${ARONDO_CONFIG_DIR}/gen/${clientId}/sessions/ and not have once: true
    const subSessionJsonPath = await findSubSessionFile(subSessionId, "session.json");
    const stat = await fs.stat(subSessionJsonPath);
    expect(stat.isFile()).toBe(true);
    const subSessionRecord = JSON.parse(await fs.readFile(subSessionJsonPath, "utf-8"));
    expect(subSessionRecord.once).toBeUndefined();
    expect(postData.genMessage.subAgent.turnNumber).toBe(1);
    expect(postData.genMessage.subAgent.isContinuedSession).toBe(false);

    // Normal /api/sessions list must not include gen-sub-* sessions
    const sessionsRes = await request.get("/api/sessions", { headers: adminHeaders });
    const sessionsList = await sessionsRes.json();
    expect(sessionsList.some((s: any) => s.id === subSessionId)).toBe(false);

    // Poll /api/gen until the sub-agent completes and Gen appends its completion message
    let completed = false;
    for (let i = 0; i < 25; i++) {
      const getRes = await request.get("/api/gen", { headers: adminHeaders });
      expect(getRes.ok()).toBeTruthy();
      const state = await getRes.json();
      const delegatedMsg = state.messages.find(
        (m: any) => m.subAgent?.subSessionId === subSessionId,
      );
      if (delegatedMsg?.subAgent?.status === "done" && state.messages.length >= 3) {
        completed = true;
        const lastMsg = state.messages[state.messages.length - 1];
        expect(lastMsg.role).toBe("gen");
        expect(lastMsg.content).toContain("Sub-agent executed task successfully");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    expect(completed).toBe(true);
  });

  test("asks user when project is ambiguous across multiple projects and delegates once clarified", async ({
    request,
  }) => {
    const testConfigDir = path.join(os.tmpdir(), "arondo-test-config");
    const genDir = path.join(testConfigDir, "gen");
    await fs.rm(genDir, { recursive: true, force: true });

    const repoAlpha = await fs.mkdtemp(path.join(os.tmpdir(), "proj-alpha-"));
    const repoBeta = await fs.mkdtemp(path.join(os.tmpdir(), "proj-beta-"));

    // Register two projects via normal sessions
    for (const repoPath of [repoAlpha, repoBeta]) {
      const sRes = await request.post("/api/sessions", {
        headers: adminHeaders,
        data: {
          runnerId,
          repoPath,
          prompt: "init project",
          isDraft: true,
          draftTrigger: "manual",
        },
      });
      expect(sRes.ok()).toBeTruthy();
    }

    // Ambiguous request without project name -> Gen asks user
    const askRes = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: "Fix the typo in README" },
    });
    expect(askRes.ok()).toBeTruthy();
    const askData = await askRes.json();
    expect(askData.genMessage.subAgent).toBeUndefined();
    expect(askData.genMessage.content).toContain(path.basename(repoAlpha));
    expect(askData.genMessage.content).toContain(path.basename(repoBeta));

    // User clarifies target project -> Gen delegates to that project (Turn #1)
    const clarifyRes = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: `Use ${path.basename(repoAlpha)}` },
    });
    expect(clarifyRes.ok()).toBeTruthy();
    const clarifyData = await clarifyRes.json();
    expect(clarifyData.genMessage?.subAgent?.repoPath).toBe(repoAlpha);
    expect(clarifyData.genMessage?.subAgent?.subSessionId).toMatch(/^gen-sub-/);
    expect(clarifyData.genMessage?.subAgent?.turnNumber).toBe(1);
    expect(clarifyData.genMessage?.subAgent?.isContinuedSession).toBe(false);

    const firstSubSessionId = clarifyData.genMessage.subAgent.subSessionId;

    const waitForSubAgentTurnDone = async (genMessageId: string) => {
      for (let i = 0; i < 25; i++) {
        const getRes = await request.get("/api/gen", { headers: adminHeaders });
        const state = await getRes.json();
        const msg = state.messages.find((m: any) => m.id === genMessageId);
        if (msg?.subAgent?.status === "done") return msg;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      throw new Error(`Timed out waiting for genMessage ${genMessageId} to finish`);
    };

    await waitForSubAgentTurnDone(clarifyData.genMessage.id);

    // Turn #2 on the same fix (without repeating project name) -> reuses firstSubSessionId
    const turn2Res = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: "Also replace Clanavi in the header component" },
    });
    expect(turn2Res.ok()).toBeTruthy();
    const turn2Data = await turn2Res.json();
    expect(turn2Data.genMessage?.subAgent?.subSessionId).toBe(firstSubSessionId);
    expect(turn2Data.genMessage?.subAgent?.turnNumber).toBe(2);
    expect(turn2Data.genMessage?.subAgent?.isContinuedSession).toBe(true);
    expect(turn2Data.genMessage?.subAgent?.continuedFromGenMessageId).toBe(clarifyData.genMessage.id);

    await waitForSubAgentTurnDone(turn2Data.genMessage.id);

    // Turn #3 on the same fix -> reuses firstSubSessionId again (Turn #3)
    const turn3Res = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: "Update the unit tests for that change too" },
    });
    expect(turn3Res.ok()).toBeTruthy();
    const turn3Data = await turn3Res.json();
    expect(turn3Data.genMessage?.subAgent?.subSessionId).toBe(firstSubSessionId);
    expect(turn3Data.genMessage?.subAgent?.turnNumber).toBe(3);
    expect(turn3Data.genMessage?.subAgent?.isContinuedSession).toBe(true);
    expect(turn3Data.genMessage?.subAgent?.continuedFromGenMessageId).toBe(turn2Data.genMessage.id);

    await waitForSubAgentTurnDone(turn3Data.genMessage.id);

    async function findSubSessionFile(subId: string, filename: string): Promise<string> {
      const clientDirs = await fs.readdir(genDir);
      for (const cd of clientDirs) {
        const candidate = path.join(genDir, cd, "sessions", subId, filename);
        try {
          await fs.stat(candidate);
          return candidate;
        } catch {}
      }
      return path.join(genDir, "sessions", subId, filename);
    }

    // Verify all 3 runs were recorded inside the single sub-session's messages.json
    const subMessagesPath = await findSubSessionFile(firstSubSessionId, "messages.json");
    const subMessages = JSON.parse(await fs.readFile(subMessagesPath, "utf-8"));
    const agentRuns = subMessages.filter((m: any) => m.type === "agent-run");
    expect(agentRuns.length).toBe(3);

    // Switching to a different project (repoBeta) -> starts a brand-new subSessionId (Turn #1)
    const betaRes = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: `In ${path.basename(repoBeta)}, update package.json` },
    });
    expect(betaRes.ok()).toBeTruthy();
    const betaData = await betaRes.json();
    expect(betaData.genMessage?.subAgent?.repoPath).toBe(repoBeta);
    expect(betaData.genMessage?.subAgent?.subSessionId).not.toBe(firstSubSessionId);
    expect(betaData.genMessage?.subAgent?.turnNumber).toBe(1);
    expect(betaData.genMessage?.subAgent?.isContinuedSession).toBe(false);

    await waitForSubAgentTurnDone(betaData.genMessage.id);

    // Returning to repoAlpha after an intervening repoBeta session -> looks up repoAlpha's
    // latest session (firstSubSessionId), checks relevance, and continues it (Turn #4)
    const returnToAlphaRes = await request.post("/api/gen", {
      headers: adminHeaders,
      data: { message: `Commit the changes in ${path.basename(repoAlpha)}` },
    });
    expect(returnToAlphaRes.ok()).toBeTruthy();
    const returnToAlphaData = await returnToAlphaRes.json();
    expect(returnToAlphaData.genMessage?.subAgent?.repoPath).toBe(repoAlpha);
    expect(returnToAlphaData.genMessage?.subAgent?.subSessionId).toBe(firstSubSessionId);
    expect(returnToAlphaData.genMessage?.subAgent?.turnNumber).toBe(4);
    expect(returnToAlphaData.genMessage?.subAgent?.isContinuedSession).toBe(true);
    expect(returnToAlphaData.genMessage?.subAgent?.continuedFromGenMessageId).toBe(
      turn3Data.genMessage.id,
    );
  });
});
