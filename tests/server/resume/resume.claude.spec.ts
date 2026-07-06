import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume.helper';

test.describe('Claude Session Resume integration tests', () => {
  test.beforeAll(async () => {
    // Create mock repository directory to prevent execve ENOENT
    await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});
  });

  test.afterAll(async () => {
    // Clean up mock repository directory
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
  });

  test('should accurately resume claude session based on CLAUDE_DIR_LOG and mock binary output', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../../mocks/bin/agy');
    const mockLogDir = path.join(os.tmpdir(), `mock_claude_logs_${Math.random().toString(36).slice(2)}`);
    
    // Ensure clean directory
    await fs.mkdir(mockLogDir, { recursive: true }).catch(() => {});
    
    console.log('[resume-test] Spawning custom Go runner for claude mock test...');
    const result = await setupRunner(request, 'claude-mock-runner', mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });
    const customRunner = result.runnerProcess;
    const customRunnerId = result.runnerId;

    try {
      // 1. Create a session with 'claude' agent on customRunnerId with prompt 'This is my first claude secret'
      console.log('[resume-test] Creating first mock claude session...');
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          prompt: 'This is my first claude secret',
          repoPath: '/tmp/test-repo',
          runnerId: customRunnerId,
          agentType: 'claude',
        }
      });
      expect(createRes.status()).toBe(201);
      const session = await createRes.json();
      const sessionId = session.id;
      
      // Wait for the run to complete
      await waitForSessionNotRunning(request, sessionId);

      // 2. Send follow-up message with prompt "what do I said before?"
      console.log('[resume-test] Sending follow-up to check context recall...');
      const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          message: 'what do I said before?',
        }
      });
      expect(msgRes.status()).toBe(200);

      // Wait for it to complete
      await waitForSessionNotRunning(request, sessionId);

      // Retrieve messages and look for the latest agent-run system message
      const msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes.status()).toBe(200);
      const messages = await msgsRes.json();
      
      // Find the second agent-run message
      const runMsgs = messages.filter((m: any) => m.type === 'agent-run');
      expect(runMsgs.length).toBe(2);
      const secondRunMsg = runMsgs[1];

      // Fetch the log of this second run
      const logRes = await request.get(`/api/sessions/${sessionId}/log?messageId=${secondRunMsg.id}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(logRes.status()).toBe(200);
      const logData = await logRes.json();
      
      console.log(`[resume-test] Mock claude output log:\n${logData.log}`);
      
      // The log should contain exactly the first secret prompt: "This is my first claude secret"
      expect(logData.log).toContain('This is my first claude secret');

      // Cleanup session
      await request.delete(`/api/sessions/${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
    } finally {
      // Kill custom runner
      await teardownRunner(customRunner);
      // Clean up mock logs directory
      await fs.rm(mockLogDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
