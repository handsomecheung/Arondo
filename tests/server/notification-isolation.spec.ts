import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume/resume.helper';

const ADMIN_TOKEN = 'test-token-123456';
const WS_BASE_URL = 'ws://localhost:3252/ws';

interface WsEventMessage {
  type: string;
  payload?: any;
  [key: string]: any;
}

/**
 * Helper to establish an authenticated WebSocket connection.
 */
function createWebSocketClient(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BASE_URL, ['arondo-token', token]);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test.describe('Push notification and event isolation between clients', () => {
  test('Client A messages trigger notifications/events only on Client A devices and not on Client B', async ({
    request,
  }) => {
    // 1. Create client token for Client A (regular user)
    const resA = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': ADMIN_TOKEN },
      data: { name: `Client-A-${crypto.randomUUID().slice(0, 8)}`, type: 'user' },
    });
    expect(resA.status()).toBe(200);
    const dataA = await resA.json();
    const clientAToken = dataA.token;
    const clientAUuid = dataA.uuid;

    // 2. Create client token for Client B (regular user)
    const resB = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': ADMIN_TOKEN },
      data: { name: `Client-B-${crypto.randomUUID().slice(0, 8)}`, type: 'user' },
    });
    expect(resB.status()).toBe(200);
    const dataB = await resB.json();
    const clientBToken = dataB.token;

    // 3. Set up runner restricted only to Client A's UUID
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-notify-repo-'));
    const mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-notify-logs-'));
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');

    const runner = await setupRunner(request, `notify-runner-${crypto.randomUUID().slice(0, 8)}`, mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });
    const runnerProcess = runner.runnerProcess;
    const runnerId = runner.runnerId;

    let sessionId = '';

    try {
      // Authorize only Client A for this runner
      const permRes = await request.post('/api/runners', {
        headers: { 'x-arondo-token': ADMIN_TOKEN },
        data: { id: runnerId, allowedUserTokenUuids: [clientAUuid] },
      });
      expect(permRes.status()).toBe(200);

      // Connect Device 1 of Client A
      const wsClientA1 = await createWebSocketClient(clientAToken);
      // Connect Device 2 of Client A (multi-device setup for Client A)
      const wsClientA2 = await createWebSocketClient(clientAToken);
      // Connect Client B device (should be isolated from Client A's traffic)
      const wsClientB = await createWebSocketClient(clientBToken);

      const receivedEventsA1: WsEventMessage[] = [];
      const receivedEventsA2: WsEventMessage[] = [];
      const receivedEventsB: WsEventMessage[] = [];

      wsClientA1.on('message', (data) => {
        try {
          receivedEventsA1.push(JSON.parse(data.toString()));
        } catch {
          // Ignore JSON parse errors
        }
      });

      wsClientA2.on('message', (data) => {
        try {
          receivedEventsA2.push(JSON.parse(data.toString()));
        } catch {
          // Ignore JSON parse errors
        }
      });

      wsClientB.on('message', (data) => {
        try {
          receivedEventsB.push(JSON.parse(data.toString()));
        } catch {
          // Ignore JSON parse errors
        }
      });

      // Create a session for Client A
      const sessionRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': clientAToken },
        data: {
          prompt: '',
          repoPath: repoDir,
          runnerId,
          agentType: 'claude',
        },
      });
      expect(sessionRes.status()).toBe(201);
      const session = await sessionRes.json();
      sessionId = session.id;

      // Client A sends a message in the session
      const testMessageContent = `isolated-push-notification-${crypto.randomUUID()}`;
      const msgRes = await request.post(`/api/sessions/${session.id}/messages`, {
        headers: { 'x-arondo-token': clientAToken },
        data: {
          message: testMessageContent,
        },
      });
      expect(msgRes.status()).toBe(200);

      // Wait for WebSocket event propagation
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Helper to check for the target message event
      const hasTargetMessageEvent = (events: WsEventMessage[]) =>
        events.some(
          (e) =>
            e.type === 'message:added' &&
            (e.payload?.content === testMessageContent || e.content === testMessageContent)
        );

      // Verification 1: Client A Device 1 received the message / notification event
      expect(hasTargetMessageEvent(receivedEventsA1)).toBe(true);

      // Verification 2: Client A Device 2 received the message / notification event
      expect(hasTargetMessageEvent(receivedEventsA2)).toBe(true);

      // Verification 3: Client B device did NOT receive Client A's message / notification event
      expect(hasTargetMessageEvent(receivedEventsB)).toBe(false);

      // Clean up WebSocket connections
      wsClientA1.close();
      wsClientA2.close();
      wsClientB.close();
    } finally {
      // Clean up created session
      if (sessionId) {
        await request.delete(`/api/sessions/${sessionId}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }

      // Stop runner and remove temp directories
      if (runnerProcess) {
        await teardownRunner(runnerProcess);
      }
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(mockLogDir, { recursive: true, force: true }).catch(() => {});

      // Clean up created tokens
      if (clientAToken) {
        await request.delete(`/api/auth/client-tokens?role=user&token=${clientAToken}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }
      if (clientBToken) {
        await request.delete(`/api/auth/client-tokens?role=user&token=${clientBToken}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }
    }
  });

  test('Task completion notifications are isolated to the session creator (User A) and not received by Admin or other users', async ({
    request,
  }) => {
    const resA = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': ADMIN_TOKEN },
      data: { name: `User-A-${crypto.randomUUID().slice(0, 8)}`, type: 'user' },
    });
    expect(resA.status()).toBe(200);
    const dataA = await resA.json();
    const clientAToken = dataA.token;
    const clientAUuid = dataA.uuid;

    const resB = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': ADMIN_TOKEN },
      data: { name: `User-B-${crypto.randomUUID().slice(0, 8)}`, type: 'user' },
    });
    expect(resB.status()).toBe(200);
    const dataB = await resB.json();
    const clientBToken = dataB.token;

    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-completion-repo-'));
    const mockLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-completion-logs-'));
    const mockBinDir = path.resolve(__dirname, '../mocks/bin/claude');

    const runner = await setupRunner(request, `completion-runner-${crypto.randomUUID().slice(0, 8)}`, mockBinDir, {
      CLAUDE_DIR_LOG: mockLogDir,
    });
    const runnerProcess = runner.runnerProcess;
    const runnerId = runner.runnerId;

    let sessionId = '';

    try {
      const permRes = await request.post('/api/runners', {
        headers: { 'x-arondo-token': ADMIN_TOKEN },
        data: { id: runnerId, allowedUserTokenUuids: [clientAUuid] },
      });
      expect(permRes.status()).toBe(200);

      const wsClientA = await createWebSocketClient(clientAToken);
      const wsAdmin = await createWebSocketClient(ADMIN_TOKEN);
      const wsClientB = await createWebSocketClient(clientBToken);

      const receivedEventsA: WsEventMessage[] = [];
      const receivedEventsAdmin: WsEventMessage[] = [];
      const receivedEventsB: WsEventMessage[] = [];

      wsClientA.on('message', (data) => {
        try {
          receivedEventsA.push(JSON.parse(data.toString()));
        } catch {}
      });

      wsAdmin.on('message', (data) => {
        try {
          receivedEventsAdmin.push(JSON.parse(data.toString()));
        } catch {}
      });

      wsClientB.on('message', (data) => {
        try {
          receivedEventsB.push(JSON.parse(data.toString()));
        } catch {}
      });

      const sessionRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': clientAToken },
        data: {
          prompt: '',
          repoPath: repoDir,
          runnerId,
          agentType: 'claude',
        },
      });
      expect(sessionRes.status()).toBe(201);
      const session = await sessionRes.json();
      sessionId = session.id;

      const msgRes = await request.post(`/api/sessions/${session.id}/messages`, {
        headers: { 'x-arondo-token': clientAToken },
        data: {
          message: 'Run task and complete',
        },
      });
      expect(msgRes.status()).toBe(200);

      await waitForSessionNotRunning(request, sessionId);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const hasCompletionEvent = (events: WsEventMessage[]) =>
        events.some(
          (e) =>
            e.type === 'session:updated' &&
            (e.payload?.id === sessionId || e.id === sessionId) &&
            (e.payload?.status === 'done' || e.status === 'done')
        );

      expect(hasCompletionEvent(receivedEventsA)).toBe(true);
      expect(hasCompletionEvent(receivedEventsAdmin)).toBe(false);
      expect(hasCompletionEvent(receivedEventsB)).toBe(false);

      wsClientA.close();
      wsAdmin.close();
      wsClientB.close();
    } finally {
      if (sessionId) {
        await request.delete(`/api/sessions/${sessionId}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }

      if (runnerProcess) {
        await teardownRunner(runnerProcess);
      }
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(mockLogDir, { recursive: true, force: true }).catch(() => {});

      if (clientAToken) {
        await request.delete(`/api/auth/client-tokens?role=user&token=${clientAToken}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }
      if (clientBToken) {
        await request.delete(`/api/auth/client-tokens?role=user&token=${clientBToken}`, {
          headers: { 'x-arondo-token': ADMIN_TOKEN },
        });
      }
    }
  });
});
