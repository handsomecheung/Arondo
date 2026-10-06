import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';

test.describe('Client project isolation tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;
  let userAToken: string;
  let userAUuid: string;
  let userBToken: string;
  let userBUuid: string;
  let projectDirA: string;
  let projectDirB: string;

  test.beforeAll(async ({ request }) => {
    // 1. Create a dedicated runner token
    const runnerName = `Project Isolation Runner ${crypto.randomUUID()}`;
    const tokenRes = await request.post('/api/auth/runner-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: runnerName },
    });
    expect(tokenRes.status()).toBe(200);
    const { token: runnerToken } = await tokenRes.json();

    // 2. Spawn Go runner process
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', runnerToken,
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[project-isolation-runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[project-isolation-runner stderr] ${data.toString().trim()}`);
    });

    // Wait for runner to connect
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === runnerName && r.connected);
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for project isolation test');
    }

    // 3. Create Client (User) A and Client (User) B
    const userARes = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: `User A ${crypto.randomUUID()}` },
    });
    expect(userARes.status()).toBe(200);
    const userAData = await userARes.json();
    userAToken = userAData.token;
    userAUuid = userAData.uuid;

    const userBRes = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: `User B ${crypto.randomUUID()}` },
    });
    expect(userBRes.status()).toBe(200);
    const userBData = await userBRes.json();
    userBToken = userBData.token;
    userBUuid = userBData.uuid;

    // 4. Authorize both User A and User B on the runner
    const patchRes = await request.post('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        id: runnerId,
        allowedUserTokenUuids: [userAUuid, userBUuid],
      },
    });
    expect(patchRes.status()).toBe(200);

    // 5. Create directories on disk for projects A and B
    projectDirA = path.join(os.tmpdir(), `arondo-test-project-a-${crypto.randomUUID()}`);
    projectDirB = path.join(os.tmpdir(), `arondo-test-project-b-${crypto.randomUUID()}`);
    await fs.mkdir(projectDirA, { recursive: true });
    await fs.mkdir(projectDirB, { recursive: true });
  });

  let sessionAId = '';
  let sessionBId = '';
  let sessionAProjectId = '';
  let sessionBProjectId = '';

  test.afterAll(async () => {
    if (runnerProcess) {
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
    }

    const configDir = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
    if (sessionAId) {
      await fs.rm(path.join(configDir, 'archived', 'sessions', sessionAId), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(configDir, 'sessions', sessionAId), { recursive: true, force: true }).catch(() => {});
    }
    if (sessionBId) {
      await fs.rm(path.join(configDir, 'archived', 'sessions', sessionBId), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(configDir, 'sessions', sessionBId), { recursive: true, force: true }).catch(() => {});
    }
    if (sessionAProjectId) {
      await fs.rm(path.join(configDir, 'projects', sessionAProjectId), { recursive: true, force: true }).catch(() => {});
    }
    if (sessionBProjectId) {
      await fs.rm(path.join(configDir, 'projects', sessionBProjectId), { recursive: true, force: true }).catch(() => {});
    }

    await fs.rm(projectDirA, { recursive: true, force: true }).catch(() => {});
    await fs.rm(projectDirB, { recursive: true, force: true }).catch(() => {});
  });

  test('client A cannot see project B created by client B, but sees project A across active and archived sessions', async ({ request }) => {
    // Step 1: User B creates a session for Project B
    const sessionBRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': userBToken },
      data: {
        repoPath: projectDirB,
        runnerId,
        agentType: 'claude',
        prompt: '',
      },
    });
    expect(sessionBRes.status()).toBe(201);
    const sessionB = await sessionBRes.json();
    expect(sessionB.projectId).toBeDefined();
    sessionBId = sessionB.id;
    sessionBProjectId = sessionB.projectId;

    // Step 2: User A creates a session for Project A
    const sessionARes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': userAToken },
      data: {
        repoPath: projectDirA,
        runnerId,
        agentType: 'claude',
        prompt: '',
      },
    });
    expect(sessionARes.status()).toBe(201);
    const sessionA = await sessionARes.json();
    expect(sessionA.projectId).toBeDefined();
    sessionAId = sessionA.id;
    sessionAProjectId = sessionA.projectId;

    // Step 3: User A requests GET /api/projects
    // User A should only see projects that have sessions created by User A (Project A).
    // User A should NOT see Project B created by User B.
    const projectsARes = await request.get('/api/projects', {
      headers: { 'x-arondo-token': userAToken },
    });
    expect(projectsARes.status()).toBe(200);
    const projectsA = await projectsARes.json();

    // User A sees Project A
    expect(projectsA.some((p: any) => p.id === sessionA.projectId)).toBe(true);
    // User A CANNOT see Project B (this assertion will fail until isolation by tokenUuid is implemented)
    expect(projectsA.some((p: any) => p.id === sessionB.projectId)).toBe(false);

    // Step 4: User A archives Session A
    const archiveRes = await request.post(`/api/sessions/${sessionA.id}/archive`, {
      headers: { 'x-arondo-token': userAToken },
    });
    expect(archiveRes.status()).toBe(200);

    // Step 5: User A requests GET /api/projects again
    // Even though Session A is archived, scanning archived sessions should still include Project A for User A
    const projectsAAfterArchiveRes = await request.get('/api/projects', {
      headers: { 'x-arondo-token': userAToken },
    });
    expect(projectsAAfterArchiveRes.status()).toBe(200);
    const projectsAAfterArchive = await projectsAAfterArchiveRes.json();

    expect(projectsAAfterArchive.some((p: any) => p.id === sessionA.projectId)).toBe(true);
    expect(projectsAAfterArchive.some((p: any) => p.id === sessionB.projectId)).toBe(false);
  });
});
