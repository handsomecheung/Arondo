import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume/resume.helper';

test.describe('Chat while session scripts are running', () => {
  test('sends a follow-up normally without a confirmation response', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');
    const mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-claude-logs-'));
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-script-chat-repo-'));
    execFileSync('git', ['init'], { cwd: repoDir });

    const { runnerProcess, runnerId } = await setupRunner(request, 'script-chat-runner', mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });

    let sessionId = '';
    try {
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          prompt: 'Initial message before the script starts',
          repoPath: repoDir,
          runnerId,
          agentType: 'claude',
        },
      });
      expect(createRes.status()).toBe(201);
      const session = await createRes.json();
      sessionId = session.id;

      await waitForSessionNotRunning(request, sessionId);

      const runScriptRes = await request.post(`/api/sessions/${sessionId}/run-script`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          scriptName: 'sleep 10',
          prompt: '!sleep 10',
        },
      });
      expect(runScriptRes.status()).toBe(200);

      const runningSessionRes = await request.get(`/api/sessions/${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      expect(runningSessionRes.status()).toBe(200);
      const runningSession = await runningSessionRes.json();
      expect(runningSession.status).toBe('script-running');

      const messageRes = await request.post(`/api/sessions/${sessionId}/messages`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          message: 'Follow-up while the shell script is still running',
        },
      });
      const messageBody = await messageRes.json();

      expect(messageRes.status()).toBe(200);
      expect(messageBody.needsConfirmation).toBeUndefined();
      expect(messageBody.success).toBe(true);
    } finally {
      if (sessionId) {
        await request.delete(`/api/sessions/${sessionId}`, {
          headers: { 'x-arondo-token': 'test-token-123456' },
        });
      }
      await teardownRunner(runnerProcess);
      await fs.rm(mockLogDir, { recursive: true, force: true });
      await fs.rm(repoDir, { recursive: true, force: true });
    }
  });
});
