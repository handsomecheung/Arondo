import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Runner Git API integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('[git-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--name', 'git-test-runner',
      '--token', 'test-runner-token-xyz'
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
        const found = list.find((r: any) => r.name === 'git-test-runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for Git API integration tests');
    }

    // Create a session bound to the actual git repository of the project
    const projectPath = path.resolve(__dirname, '../..');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: projectPath,
        runnerId: runnerId,
        name: 'Git Test Session'
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
      console.log('[git-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[git-test] Go runner stopped.');
    }
  });

  test('should return correct git status for the repository', async ({ request }) => {
    const response = await request.get(`/api/sessions/${sessionId}/git-status`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty('isGitRepo');
    expect(result.isGitRepo).toBe(true);
    expect(result).toHaveProperty('hasChanges');
    expect(typeof result.hasChanges).toBe('boolean');
  });

  test('should return git diff HTML', async ({ request }) => {
    const response = await request.get(`/api/sessions/${sessionId}/diff`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/html');
    const html = await response.text();
    // It should either render the diff or say "No changes detected"
    expect(html).toContain('<!DOCTYPE html>');
  });
});
