import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CONFIG_DIR = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');

test.describe('Temp dir project task visibility', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');

    console.log('[temp-dir-projects-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-temp-dir'
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[temp-dir-projects-runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[temp-dir-projects-runner stderr] ${data.toString().trim()}`);
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
      throw new Error('Failed to register runner for temp-dir project visibility tests');
    }
    console.log(`[temp-dir-projects-test] Registered runner ID: ${runnerId}`);
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('[temp-dir-projects-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[temp-dir-projects-test] Go runner stopped.');
    }
  });

  test('stores tempDir project metadata and hides project and session listings', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        tempDir: true,
        runnerId,
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.projectId).toBeDefined();

    const projectRaw = await fs.readFile(path.join(CONFIG_DIR, 'projects', session.projectId, 'project.json'), 'utf-8');
    const project = JSON.parse(projectRaw);
    expect(project.tempDir).toBe(true);

    const projectsRes = await request.get('/api/projects', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(projectsRes.status()).toBe(200);
    const projects = await projectsRes.json();
    expect(projects.find((p: any) => p.id === session.projectId)).toBeUndefined();

    const sessionsRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(sessionsRes.status()).toBe(200);
    const sessions = await sessionsRes.json();
    expect(sessions.find((s: any) => s.id === session.id)).toBeUndefined();

    const archiveRes = await request.post(`/api/sessions/${session.id}/archive`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(archiveRes.status()).toBe(200);

    const archivedRes = await request.get('/api/sessions/archived', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(archivedRes.status()).toBe(200);
    const archived = await archivedRes.json();
    expect(archived.find((s: any) => s.id === session.id)).toBeUndefined();

    const archivedExistsRes = await request.get('/api/sessions/archived/exists', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(archivedExistsRes.status()).toBe(200);
    expect(await archivedExistsRes.json()).toEqual({ exists: false });
  });

  test('hides temp-dir project agent tasks from /api/tasks', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'echo temp dir task',
        tempDir: true,
        runnerId,
        force: true,
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.projectId).toBeDefined();

    const tasksRes = await request.get('/api/tasks', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(tasksRes.status()).toBe(200);
    const tasks = await tasksRes.json();
    expect(tasks.find((task: any) => task.sessionId === session.id)).toBeUndefined();
  });

  test('hides temp-dir project todo messages from /api/todo-messages', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'draft temp dir todo',
        message: 'draft temp dir todo',
        tempDir: true,
        runnerId,
        isDraft: true,
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.projectId).toBeDefined();

    const todoRes = await request.get('/api/todo-messages', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(todoRes.status()).toBe(200);
    const todos = await todoRes.json();
    expect(todos.find((todo: any) => todo.sessionId === session.id)).toBeUndefined();
  });

  test('does not reuse temp dir while session in it is running', async ({ request }) => {
    const createRes1 = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'running temp dir 1',
        tempDir: true,
        runnerId,
        force: true,
      }
    });
    expect(createRes1.status()).toBe(201);
    const session1 = await createRes1.json();
    expect(session1.repoPath).toBeDefined();

    const createRes2 = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'running temp dir 2',
        tempDir: true,
        runnerId,
        force: true,
      }
    });
    expect(createRes2.status()).toBe(201);
    const session2 = await createRes2.json();
    expect(session2.repoPath).toBeDefined();
    expect(session2.repoPath).not.toBe(session1.repoPath);
  });
});

