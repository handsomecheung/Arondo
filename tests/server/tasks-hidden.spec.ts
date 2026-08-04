import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Hidden project task visibility', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');

    console.log('[hidden-tasks-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-hidden'
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[hidden-tasks-runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[hidden-tasks-runner stderr] ${data.toString().trim()}`);
    });

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'Test Hidden Runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for hidden task visibility tests');
    }
    console.log(`[hidden-tasks-test] Registered runner ID: ${runnerId}`);
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('[hidden-tasks-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[hidden-tasks-test] Go runner stopped.');
    }
  });

  test('hides hidden-project agent tasks from /api/tasks', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'echo hidden task',
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

  test('hides hidden-project todo messages from /api/todo-messages', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'draft hidden todo',
        message: 'draft hidden todo',
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
});
