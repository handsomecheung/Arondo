import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Runner Exec API integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('[exec-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--name', 'exec-test-runner',
      '--token', 'test-runner-token-exec'
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
        const found = list.find((r: any) => r.name === 'exec-test-runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for Exec API integration tests');
    }

    // Create session
    const projectPath = path.resolve(__dirname, '../..');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: projectPath,
        runnerId: runnerId,
        name: 'Exec Test Session'
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    sessionId = session.id;
  });

  test.afterAll(async ({ request }) => {
    // Delete session
    if (sessionId && request) {
      try {
        await request.delete(`/api/sessions/${sessionId}`, {
          headers: { 'x-arondo-token': 'test-token-123456' }
        });
      } catch (err) {
        console.error('Failed to cleanup session in afterAll:', err);
      }
    }

    if (runnerProcess) {
      console.log('[exec-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[exec-test] Go runner stopped.');
    }
  });

  test('should execute shell command script on runner and complete successfully', async ({ request }) => {
    // Trigger run-script
    console.log('[exec-test] Triggering script execution...');
    const runRes = await request.post(`/api/sessions/${sessionId}/run-script`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        scriptName: 'echo "hello from tests"',
        prompt: 'test execution'
      }
    });
    expect(runRes.status()).toBe(200);
    const runJson = await runRes.json();
    expect(runJson.success).toBeTruthy();
    expect(runJson.messageId).toBeDefined();

    // Poll the task status to ensure it finishes successfully (exitCode: 0)
    console.log('[exec-test] Polling task status...');
    const maxRetries = 30;
    let taskCompleted = false;

    for (let i = 0; i < maxRetries; i++) {
      const taskRes = await request.get('/api/tasks', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(taskRes.status()).toBe(200);
      const tasks = await taskRes.json();
      
      // Find our task
      const task = tasks.find((t: any) => t.sessionId === sessionId && t.scriptName === 'echo "hello from tests"');
      if (task) {
        if (task.completedAt) {
          expect(task.exitCode).toBe(0);
          taskCompleted = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(taskCompleted).toBeTruthy();

    // Verify session status returned to idle
    const sessRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const sessions = await sessRes.json();
    const currentSess = sessions.find((s: any) => s.id === sessionId);
    expect(currentSess).toBeDefined();
    expect(currentSess.status).toBe('done');
  });
});
