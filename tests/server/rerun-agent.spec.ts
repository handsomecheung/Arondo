import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume/resume.helper';

test.describe('Rerun Agent API integration tests', () => {
  test.beforeAll(async () => {
    // Create mock repository directory to prevent execve ENOENT
    await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});
  });

  test.afterAll(async () => {
    // Clean up mock repository directory
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
  });

  test('should validate messageId and retry failed agent runs with correct prompt and resume', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/codex');
    
    console.log('[rerun-test] Spawning custom Go runner for codex mock test...');
    const result = await setupRunner(request, 'codex-rerun-mock-runner', mockBinDir);
    const customRunner = result.runnerProcess;
    const customRunnerId = result.runnerId;

    try {
      // 1. Create a session with first message prompt (succeeds)
      console.log('[rerun-test] Creating first mock codex session...');
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          prompt: 'First initial prompt',
          repoPath: '/tmp/test-repo',
          runnerId: customRunnerId,
          agentType: 'codex',
        }
      });
      expect(createRes.status()).toBe(201);
      const session = await createRes.json();
      const sessionId = session.id;
      
      await waitForSessionNotRunning(request, sessionId);

      // Get messages to check 1st run
      let msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes.status()).toBe(200);
      let messages = await msgsRes.json();
      const firstRunMsg = messages.find((m: any) => m.type === 'agent-run');
      expect(firstRunMsg).toBeDefined();

      // 2. Test: missing messageId returns 400
      const missingIdRes = await request.post(`/api/sessions/${sessionId}/rerun-agent`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {},
      });
      expect(missingIdRes.status()).toBe(400);
      const missingIdJson = await missingIdRes.json();
      expect(missingIdJson.error).toBe('messageId is required');

      // 3. Test: retry a successful run returns 400
      const retrySuccessRes = await request.post(`/api/sessions/${sessionId}/rerun-agent`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { messageId: firstRunMsg.id },
      });
      expect(retrySuccessRes.status()).toBe(400);
      const retrySuccessJson = await retrySuccessRes.json();
      expect(retrySuccessJson.error).toBe('Only failed agent runs can be retried');

      // 4. Send second follow-up message that will fail (contains FAIL_MOCK)
      console.log('[rerun-test] Sending second follow-up message (failing)...');
      const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          message: 'Second follow-up message FAIL_MOCK',
        }
      });
      expect(msgRes.status()).toBe(200);

      await waitForSessionNotRunning(request, sessionId);

      // Retrieve messages to find the 2nd (failed) run message
      msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes.status()).toBe(200);
      messages = await msgsRes.json();
      const runMsgs = messages.filter((m: any) => m.type === 'agent-run');
      expect(runMsgs.length).toBe(2);
      const secondRunMsg = runMsgs[1];

      // Verify that 2nd run failed with return error
      const secondReturnMsg = messages.find((m: any) => m.parentId === secondRunMsg.id && m.type === 'agent-return');
      expect(secondReturnMsg).toBeDefined();
      expect(secondReturnMsg.content).toContain('Error');

      // 5. Trigger rerun-agent with secondRunMsg.id (simulating user clicking Retry on the failed card)
      console.log('[rerun-test] Triggering rerun-agent on failed run...');
      const rerunRes = await request.post(`/api/sessions/${sessionId}/rerun-agent`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { messageId: secondRunMsg.id },
      });
      expect(rerunRes.status()).toBe(200);

      // Wait for rerun to complete
      await waitForSessionNotRunning(request, sessionId);

      // 6. Retrieve messages and inspect all agent-run messages
      msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes.status()).toBe(200);
      messages = await msgsRes.json();

      const allRunMsgs = messages.filter((m: any) => m.type === 'agent-run');
      expect(allRunMsgs.length).toBe(3);

      const thirdRunMsg = allRunMsgs[2];
      console.log('[rerun-test] 3rd run prompt:', thirdRunMsg.prompt);
      console.log('[rerun-test] 3rd run content (command):', thirdRunMsg.content);

      // Expected behavior:
      // The rerun should use the retried message prompt ("Second follow-up message FAIL_MOCK"),
      // NOT the initial message prompt ("First initial prompt").
      expect(thirdRunMsg.prompt).toContain('Second follow-up message FAIL_MOCK');
      expect(thirdRunMsg.prompt).not.toContain('First initial prompt');

      // The rerun command for codex should be a resume command
      expect(thirdRunMsg.content).toContain('resume');

      // Cleanup session
      await request.delete(`/api/sessions/${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
    } finally {
      await teardownRunner(customRunner);
    }
  });
});
