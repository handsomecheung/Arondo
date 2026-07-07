import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Sessions API integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('[sessions-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--name', 'sessions-test-runner',
      '--token', 'test-runner-token-xyz'
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[sessions-runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[sessions-runner stderr] ${data.toString().trim()}`);
    });

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'sessions-test-runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for sessions API integration tests');
    }
    console.log(`[sessions-test] Registered runner ID: ${runnerId}`);
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('[sessions-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[sessions-test] Go runner stopped.');
    }
  });

  test('should fail to create session with missing payload parameters', async ({ request }) => {
    const response = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        repoPath: '/tmp/test-repo'
        // missing runnerId
      }
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('runnerId is required');
  });

  test('should create, update, list, and delete a session successfully', async ({ request }) => {
    // 1. Create a session (use blank prompt to keep status idle and bypass agent execution)
    console.log('[sessions-test] Creating test session...');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        name: 'My Custom Test Session'
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.name).toBe('My Custom Test Session');
    expect(session.status).toBe('idle');

    const sessionId = session.id;

    // 2. List sessions and verify it exists
    console.log('[sessions-test] Listing sessions...');
    const listRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(listRes.status()).toBe(200);
    const sessions = await listRes.json();
    const found = sessions.find((s: any) => s.id === sessionId);
    expect(found).toBeDefined();
    expect(found.name).toBe('My Custom Test Session');

    // 3. Update (PATCH) session
    console.log('[sessions-test] Updating session...');
    const updateRes = await request.patch(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        name: 'Updated Session Name',
        agentType: 'claude'
      }
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.name).toBe('Updated Session Name');
    expect(updated.agentType).toBe('claude');

    // 4. Delete the session
    console.log('[sessions-test] Deleting session...');
    const deleteRes = await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(deleteRes.status()).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.success).toBeTruthy();

    // 5. Verify it is deleted from list
    console.log('[sessions-test] Verifying deletion...');
    const listAfterRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const sessionsAfter = await listAfterRes.json();
    const foundAfter = sessionsAfter.find((s: any) => s.id === sessionId);
    expect(foundAfter).toBeUndefined();
  });
});
