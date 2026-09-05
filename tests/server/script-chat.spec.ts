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

  test('marks completed script message as deleted and hides it from messages list', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');
    const mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-claude-logs-'));
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-script-chat-repo-'));
    execFileSync('git', ['init'], { cwd: repoDir });

    const { runnerProcess, runnerId } = await setupRunner(request, 'script-delete-runner', mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });

    let sessionId = '';
    try {
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          prompt: 'Session for script deletion test',
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
          scriptName: 'echo "hello"',
          prompt: '!echo "hello"',
        },
      });
      expect(runScriptRes.status()).toBe(200);
      const { messageId } = await runScriptRes.json();
      expect(messageId).toBeDefined();

      // Wait for script to complete
      await waitForSessionNotRunning(request, sessionId);

      // Verify messages endpoint contains the script run message
      const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      expect(msgsRes1.status()).toBe(200);
      const msgs1 = await msgsRes1.json();
      expect(msgs1.some((m: any) => m.id === messageId)).toBe(true);

      // Delete the script message
      const delRes = await request.delete(`/api/sessions/${sessionId}/messages/${messageId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      expect(delRes.status()).toBe(200);
      const delBody = await delRes.json();
      expect(delBody.success).toBe(true);

      // Verify messages endpoint no longer returns the deleted script message
      const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      expect(msgsRes2.status()).toBe(200);
      const msgs2 = await msgsRes2.json();
      expect(msgs2.some((m: any) => m.id === messageId)).toBe(false);
      expect(msgs2.some((m: any) => m.parentId === messageId)).toBe(false);

      // Verify messages.json still contains the message with deleted: true
      const configDir = process.env.ARONDO_CONFIG_DIR ? path.resolve(process.env.ARONDO_CONFIG_DIR) : path.join(process.cwd(), 'data');
      const sessionDir = path.join(configDir, 'sessions', sessionId);
      const messagesRaw = await fs.readFile(path.join(sessionDir, 'messages.json'), 'utf-8');
      const messagesOnDisk = JSON.parse(messagesRaw);
      const diskMsg = messagesOnDisk.find((m: any) => m.id === messageId);
      expect(diskMsg).toBeDefined();
      expect(diskMsg.deleted).toBe(true);
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

  test('retries a failed script in its existing card', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');
    const mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-script-retry-logs-'));
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-script-retry-repo-'));
    execFileSync('git', ['init'], { cwd: repoDir });
    const { runnerProcess, runnerId } = await setupRunner(request, 'script-retry-runner', mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });

    let sessionId = '';
    try {
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { prompt: 'Session for script retry test', repoPath: repoDir, runnerId, agentType: 'claude' },
      });
      expect(createRes.status()).toBe(201);
      sessionId = (await createRes.json()).id;
      await waitForSessionNotRunning(request, sessionId);

      const runRes = await request.post(`/api/sessions/${sessionId}/run-script`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { scriptName: 'exit 1', prompt: '!exit 1' },
      });
      expect(runRes.status()).toBe(200);
      const { messageId } = await runRes.json();
      await waitForSessionNotRunning(request, sessionId);

      const retryRes = await request.post(`/api/sessions/${sessionId}/restart-script`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { scriptName: 'exit 1', messageId },
      });
      expect(retryRes.status()).toBe(200);
      await waitForSessionNotRunning(request, sessionId);

      const messagesRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      const messages = await messagesRes.json();
      expect(messages.filter((message: any) => message.type === 'script-run')).toHaveLength(1);
      expect(messages.find((message: any) => message.type === 'script-run').id).toBe(messageId);
    } finally {
      if (sessionId) await request.delete(`/api/sessions/${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
      await teardownRunner(runnerProcess);
      await fs.rm(mockLogDir, { recursive: true, force: true });
      await fs.rm(repoDir, { recursive: true, force: true });
    }
  });
});
