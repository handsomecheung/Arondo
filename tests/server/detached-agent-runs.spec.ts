import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ChildProcess } from 'child_process';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume/resume.helper';

const headers = { 'x-arondo-token': 'test-token-123456' };

async function getMessages(request: any, sessionId: string) {
  const response = await request.get(`/api/messages?sessionId=${sessionId}`, { headers });
  expect(response.status()).toBe(200);
  return response.json();
}

async function waitForDetachedAgent(request: any, sessionId: string, runMessageId: string) {
  for (let i = 0; i < 50; i++) {
    const messages = await getMessages(request, sessionId);
    const returned = messages.find((message: any) => message.parentId === runMessageId);
    if (returned) return { messages, returned };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Detached agent run ${runMessageId} timed out`);
}

test.describe('Detached agent runs API', () => {
  let runnerProcess: ChildProcess;
  let runnerId = '';
  let repoDir = '';
  let mockLogDir = '';
  const sessionIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-detached-agent-repo-'));
    mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-detached-agent-logs-'));
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');
    const runner = await setupRunner(request, 'detached-agent-runner', mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });
    runnerProcess = runner.runnerProcess;
    runnerId = runner.runnerId;
  });

  test.afterAll(async ({ request }) => {
    for (const sessionId of sessionIds) {
      await request.delete(`/api/sessions/${sessionId}`, { headers });
    }
    await teardownRunner(runnerProcess);
    await fs.rm(repoDir, { recursive: true, force: true });
    await fs.rm(mockLogDir, { recursive: true, force: true });
  });

  async function createIdleSession(request: any) {
    const response = await request.post('/api/sessions', {
      headers,
      data: { prompt: '', repoPath: repoDir, runnerId, agentType: 'claude' },
    });
    expect(response.status()).toBe(201);
    const session = await response.json();
    sessionIds.push(session.id);
    return session;
  }

  test('validates detached-agent kind, agent type, and /btw message', async ({ request }) => {
    const session = await createIdleSession(request);

    for (const [data, error] of [
      [{ kind: 'other', message: 'hello' }, 'kind must be review or btw'],
      [{ kind: 'review', agentType: 'unknown' }, 'agentType is invalid'],
      [{ kind: 'btw', message: '   ' }, 'message is required for btw'],
    ]) {
      const response = await request.post(`/api/sessions/${session.id}/detached-agent-runs`, {
        headers,
        data,
      });
      expect(response.status()).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
    }
  });

  test('runs /btw in a separate context with the parent conversation', async ({ request }) => {
    const createResponse = await request.post('/api/sessions', {
      headers,
      data: {
        prompt: 'Remember that the release target is mobile browsers.',
        repoPath: repoDir,
        runnerId,
        agentType: 'claude',
      },
    });
    expect(createResponse.status()).toBe(201);
    const session = await createResponse.json();
    sessionIds.push(session.id);
    await waitForSessionNotRunning(request, session.id);

    const response = await request.post(`/api/sessions/${session.id}/detached-agent-runs`, {
      headers,
      data: { kind: 'btw', message: 'What is the release target?', agentType: 'claude' },
    });
    expect(response.status()).toBe(200);
    const { messageId } = await response.json();

    const { messages, returned } = await waitForDetachedAgent(request, session.id, messageId);
    const run = messages.find((message: any) => message.id === messageId);
    expect(run).toMatchObject({
      type: 'detached-agent-run',
      detachedKind: 'btw',
      resolvedAgentType: 'claude',
    });
    expect(run.agentSessionKey).toBeTruthy();
    expect(run.prompt).toContain('Remember that the release target is mobile browsers.');
    expect(run.prompt).toContain('User request:\nWhat is the release target?');
    expect(returned).toMatchObject({
      type: 'detached-agent-return',
      parentId: messageId,
      detachedKind: 'btw',
      role: 'agent',
      content: '✅ Done!',
    });

    const sessionResponse = await request.get(`/api/sessions/${session.id}`, { headers });
    await expect(sessionResponse.json()).resolves.toMatchObject({ status: 'done' });
  });

  test('allows /review without a message and rejects archived sessions', async ({ request }) => {
    const session = await createIdleSession(request);
    const reviewResponse = await request.post(`/api/sessions/${session.id}/detached-agent-runs`, {
      headers,
      data: { kind: 'review', agentType: 'claude' },
    });
    expect(reviewResponse.status()).toBe(200);
    const { messageId } = await reviewResponse.json();

    const { messages, returned } = await waitForDetachedAgent(request, session.id, messageId);
    const run = messages.find((message: any) => message.id === messageId);
    expect(run.prompt).toContain('Review the current working tree');
    expect(run.prompt).not.toContain('User request:');
    expect(returned).toMatchObject({ type: 'detached-agent-return', detachedKind: 'review' });

    const archiveResponse = await request.post(`/api/sessions/${session.id}/archive`, { headers });
    expect(archiveResponse.status()).toBe(200);
    const archivedResponse = await request.post(`/api/sessions/${session.id}/detached-agent-runs`, {
      headers,
      data: { kind: 'review' },
    });
    expect(archivedResponse.status()).toBe(403);
    await expect(archivedResponse.json()).resolves.toEqual({
      error: 'Session is archived. Unarchive it to run a separate agent.',
    });
  });
});
