import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { readOnceCache, writeOnceCache } from '../../lib/store';
import migrateTempDirRecords from '../../migration/2026-11-04-retire-temp-dir.mjs';

const CONFIG_DIR = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');

test.describe('Retired tempDir migration and single-use automation sessions', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');

    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-temp-dir'
    ], {
      stdio: 'pipe',
    });

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'Test Temp Dir Runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for single-use automation session tests');
    }
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
    }
  });

  test('rejects retired tempDir option on POST /api/sessions', async ({ request }) => {
    const res = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        tempDir: true,
        runnerId,
      }
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('tempDir is no longer supported; use automation instead');
  });

  test('migrates existing Project.tempDir and Session.tempDir records while preserving workspaces and history', async () => {
    const tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-migrate-tempdir-'));
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-preserved-workspace-'));
    try {
      await fs.writeFile(path.join(workspaceDir, 'keep.txt'), 'workspace data', 'utf-8');

      const projectDir = path.join(tempConfigDir, 'projects', 'legacy-temp-proj');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'project.json'),
        JSON.stringify({
          id: 'legacy-temp-proj',
          repoPath: workspaceDir,
          runnerId: 'runner-1',
          tempDir: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        'utf-8',
      );

      const activeSessionDir = path.join(tempConfigDir, 'sessions', 'legacy-sess-1');
      await fs.mkdir(activeSessionDir, { recursive: true });
      await fs.writeFile(
        path.join(activeSessionDir, 'session.json'),
        JSON.stringify({
          id: 'legacy-sess-1',
          status: 'done',
          agentType: 'claude',
          repoPath: workspaceDir,
          projectId: 'legacy-temp-proj',
          runnerId: 'runner-1',
          tempDir: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        'utf-8',
      );
      await fs.writeFile(
        path.join(activeSessionDir, 'messages.json'),
        JSON.stringify([{ id: 'msg-1', sessionId: 'legacy-sess-1', role: 'user', content: 'hello', createdAt: new Date().toISOString() }]),
        'utf-8',
      );

      const archivedSessionDir = path.join(tempConfigDir, 'archived', 'sessions', 'legacy-sess-2');
      await fs.mkdir(archivedSessionDir, { recursive: true });
      await fs.writeFile(
        path.join(archivedSessionDir, 'session.json'),
        JSON.stringify({
          id: 'legacy-sess-2',
          status: 'done',
          agentType: 'claude',
          repoPath: workspaceDir,
          projectId: 'legacy-temp-proj',
          runnerId: 'runner-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        'utf-8',
      );

      await fs.writeFile(
        path.join(tempConfigDir, 'arondo.json'),
        JSON.stringify({
          setitngs: {
            showTempDirSessions: true,
            tempDirProjectRetentionHours: 48,
          },
        }),
        'utf-8',
      );

      await migrateTempDirRecords({ configDir: tempConfigDir });

      await expect(fs.stat(projectDir)).rejects.toThrow();
      expect(await fs.readFile(path.join(workspaceDir, 'keep.txt'), 'utf-8')).toBe('workspace data');

      const migratedActive = JSON.parse(await fs.readFile(path.join(activeSessionDir, 'session.json'), 'utf-8'));
      expect(migratedActive.automation).toBe(true);
      expect(migratedActive.noProject).toBe(true);
      expect(migratedActive.tempDir).toBeUndefined();
      expect(migratedActive.projectId).toBeUndefined();
      expect(migratedActive.repoPath).toBe(workspaceDir);

      const preservedMessages = JSON.parse(await fs.readFile(path.join(activeSessionDir, 'messages.json'), 'utf-8'));
      expect(preservedMessages).toHaveLength(1);
      expect(preservedMessages[0].content).toBe('hello');

      const migratedArchived = JSON.parse(await fs.readFile(path.join(archivedSessionDir, 'session.json'), 'utf-8'));
      expect(migratedArchived.automation).toBe(true);
      expect(migratedArchived.noProject).toBe(true);
      expect(migratedArchived.tempDir).toBeUndefined();
      expect(migratedArchived.projectId).toBeUndefined();

      const migratedConfig = JSON.parse(await fs.readFile(path.join(tempConfigDir, 'arondo.json'), 'utf-8'));
      expect(migratedConfig.setitngs.showAutomationSessions).toBe(true);
      expect(migratedConfig.setitngs.automationSessionRetentionHours).toBe(48);
      expect(migratedConfig.setitngs.showTempDirSessions).toBeUndefined();
      expect(migratedConfig.setitngs.tempDirProjectRetentionHours).toBeUndefined();
    } finally {
      await fs.rm(tempConfigDir, { recursive: true, force: true });
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  test('cleans up automation sessions older than automationSessionRetentionHours while preserving workspaces', async ({ request }) => {
    const headers = { 'x-arondo-token': 'test-token-123456' };
    await request.post('/api/settings', {
      headers,
      data: { automationSessionRetentionHours: 2 },
    });

    const createRes = await request.post('/api/sessions', {
      headers,
      data: {
        prompt: '',
        automation: true,
        runnerId,
      },
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();

    const sessionFile = path.join(CONFIG_DIR, 'sessions', session.id, 'session.json');
    const saved = JSON.parse(await fs.readFile(sessionFile, 'utf-8'));
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    saved.createdAt = threeHoursAgo;
    saved.updatedAt = threeHoursAgo;
    await fs.writeFile(sessionFile, JSON.stringify(saved, null, 2), 'utf-8');

    const listRes = await request.get('/api/sessions', { headers });
    expect(listRes.status()).toBe(200);

    await expect(fs.stat(sessionFile)).rejects.toThrow();
    expect((await fs.stat(session.repoPath)).isDirectory()).toBe(true);

    await request.post('/api/settings', {
      headers,
      data: { automationSessionRetentionHours: 72 },
    });
  });

  test('validates once option and rejects sending subsequent messages', async ({ request }) => {
    // 1. Should reject once without automation
    const invalidRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: '/tmp/test-repo',
        runnerId,
        once: true,
      }
    });
    expect(invalidRes.status()).toBe(400);
    const invalidJson = await invalidRes.json();
    expect(invalidJson.error).toBe('once can only be used when automation is set');

    // 2. Create session with automation and once
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        automation: true,
        runnerId,
        once: true,
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.once).toBe(true);
    expect(session.automation).toBe(true);

    // 3. Reject follow-up message
    const msgRes = await request.post(`/api/sessions/${session.id}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Second message',
      }
    });
    expect(msgRes.status()).toBe(400);
    const msgJson = await msgRes.json();
    expect(msgJson.error).toBe('Session only allows a single message');

    // 4. Reject todo message
    const todoRes = await request.post(`/api/sessions/${session.id}/todo-messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Queued message',
        trigger: { kind: 'manual' },
      }
    });
    expect(todoRes.status()).toBe(400);
    const todoJson = await todoRes.json();
    expect(todoJson.error).toBe('Session only allows a single message');

    // 5. Reject detached agent run
    const detachedRes = await request.post(`/api/sessions/${session.id}/detached-agent-runs`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        kind: 'review',
      }
    });
    expect(detachedRes.status()).toBe(400);
    const detachedJson = await detachedRes.json();
    expect(detachedJson.error).toBe('Session only allows a single message');
  });

  test('validates cache option and retrieves result from cache', async ({ request }) => {
    // 1. Should reject cache without once
    const invalidRes1 = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'test prompt',
        automation: true,
        runnerId,
        cache: 'on',
      }
    });
    expect(invalidRes1.status()).toBe(400);
    expect((await invalidRes1.json()).error).toBe('cache can only be used when once is set');

    // 2. Should reject invalid cache value
    const invalidRes2 = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'test prompt',
        automation: true,
        runnerId,
        once: true,
        cache: 'maybe',
      }
    });
    expect(invalidRes2.status()).toBe(400);
    expect((await invalidRes2.json()).error).toBe('cache must be on or off');

    // 3. Pre-seed cache file
    const prompt = 'cached prompt test ' + crypto.randomUUID();
    const promptHash = crypto.createHash('sha256').update(prompt.trim()).digest('hex');
    const cacheDir = path.join(CONFIG_DIR, 'cache', 'once');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, promptHash), 'CACHED AGENT OUTPUT 12345\n', 'utf-8');
    await fs.writeFile(
      path.join(cacheDir, `${promptHash}.meta.json`),
      JSON.stringify({ createdAt: Date.now() }),
      'utf-8',
    );

    // 4. Create session with cache: "on"
    const cachedSessionRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt,
        automation: true,
        runnerId,
        once: true,
        cache: 'on',
      }
    });
    expect(cachedSessionRes.status()).toBe(201);
    const session = await cachedSessionRes.json();
    expect(session.status).toBe('done');
    expect(session.cache).toBe('on');
    expect(session.once).toBe(true);

    // 5. Check messages.json contains cache: "on"
    const messagesRes = await request.get(`/api/messages?sessionId=${session.id}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(messagesRes.status()).toBe(200);
    const messages = await messagesRes.json();
    expect(messages.length).toBeGreaterThan(0);
    for (const msg of messages) {
      expect(msg.cache).toBe('on');
    }

    // 6. Check log contains cached output and command contains cache hash
    const agentRunMsg = messages.find((m: any) => m.type === 'agent-run');
    expect(agentRunMsg).toBeDefined();
    expect(agentRunMsg.command).toBe(`[cached: ${promptHash}]`);
    expect(agentRunMsg.content).toContain(`[cached: ${promptHash}]`);
    const logRes = await request.get(`/api/sessions/${session.id}/log?messageId=${agentRunMsg.id}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(logRes.status()).toBe(200);
    const logJson = await logRes.json();
    expect(logJson.log).toBe('CACHED AGENT OUTPUT 12345\n');
  });

  test('expires cached output after seven days without deleting it', async () => {
    const prompt = `expired cache test ${crypto.randomUUID()}`;
    await writeOnceCache(prompt, 'EXPIRED CACHED OUTPUT');

    const promptHash = crypto.createHash('sha256').update(prompt.trim()).digest('hex');
    const metadataPath = path.join(CONFIG_DIR, 'cache', 'once', `${promptHash}.meta.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    expect(metadata.createdAt).toEqual(expect.any(Number));
    await fs.writeFile(
      metadataPath,
      JSON.stringify({ createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000) }),
      'utf-8',
    );

    await expect(fs.stat(path.join(CONFIG_DIR, 'cache', 'once', promptHash))).resolves.toBeDefined();
    await expect(readOnceCache(prompt)).resolves.toBeNull();
  });

  test('deletes once cache when cached session is deleted', async ({ request }) => {
    const prompt = 'delete cache test ' + crypto.randomUUID();
    const promptHash = crypto.createHash('sha256').update(prompt.trim()).digest('hex');
    const cacheDir = path.join(CONFIG_DIR, 'cache', 'once');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, promptHash), 'CACHED AGENT OUTPUT TO DELETE\n', 'utf-8');
    await fs.writeFile(
      path.join(cacheDir, `${promptHash}.meta.json`),
      JSON.stringify({ createdAt: Date.now() }),
      'utf-8',
    );

    const cachedSessionRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt,
        automation: true,
        runnerId,
        once: true,
        cache: 'on',
      }
    });
    expect(cachedSessionRes.status()).toBe(201);
    const session = await cachedSessionRes.json();

    await expect(fs.stat(path.join(cacheDir, promptHash))).resolves.toBeDefined();
    await expect(fs.stat(path.join(cacheDir, `${promptHash}.meta.json`))).resolves.toBeDefined();

    const deleteRes = await request.delete(`/api/sessions/${session.id}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(deleteRes.status()).toBe(200);

    await expect(fs.stat(path.join(cacheDir, promptHash))).rejects.toThrow();
    await expect(fs.stat(path.join(cacheDir, `${promptHash}.meta.json`))).rejects.toThrow();
    await expect(readOnceCache(prompt)).resolves.toBeNull();
  });
});
