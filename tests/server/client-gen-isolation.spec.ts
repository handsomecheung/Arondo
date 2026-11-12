import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import crypto from 'crypto';

test.describe('Client Gen isolation tests', () => {
  let userAToken: string;
  let userAUuid: string;
  let userBToken: string;
  let userBUuid: string;
  const configDir = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');

  test.beforeAll(async ({ request }) => {
    // Create Client A
    const userARes = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: `Gen User A ${crypto.randomUUID()}` },
    });
    expect(userARes.status()).toBe(200);
    const userAData = await userARes.json();
    userAToken = userAData.token;
    userAUuid = userAData.uuid;

    // Create Client B
    const userBRes = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: `Gen User B ${crypto.randomUUID()}` },
    });
    expect(userBRes.status()).toBe(200);
    const userBData = await userBRes.json();
    userBToken = userBData.token;
    userBUuid = userBData.uuid;
  });

  test('Gen conversations and files are completely isolated between clients in separate directories', async ({ request }) => {
    // 1. Client A sends a message to Gen
    const msgA = `Hello from Client A ${Date.now()}`;
    const postResA = await request.post('/api/gen', {
      headers: { 'x-arondo-token': userAToken },
      data: { message: msgA },
    });
    expect(postResA.status()).toBe(200);
    const postDataA = await postResA.json();
    expect(postDataA.ok).toBe(true);
    expect(postDataA.userMessage.content).toBe(msgA);
    expect(postDataA.userMessage.tokenUuid).toBe(userAUuid);

    // Verify directory on filesystem: ${ARONDO_CONFIG_DIR}/gen/${userAUuid}
    const clientADir = path.join(configDir, 'gen', userAUuid);
    const clientBDir = path.join(configDir, 'gen', userBUuid);

    expect(fsSync.existsSync(path.join(clientADir, 'messages.json'))).toBe(true);
    const clientAMsgsRaw = await fs.readFile(path.join(clientADir, 'messages.json'), 'utf-8');
    const clientAMessages = JSON.parse(clientAMsgsRaw);
    expect(clientAMessages.some((m: any) => m.content === msgA)).toBe(true);

    // 2. Client B should see an empty Gen conversation (isolated from Client A)
    const getResB = await request.get('/api/gen', {
      headers: { 'x-arondo-token': userBToken },
    });
    expect(getResB.status()).toBe(200);
    const getDataB = await getResB.json();
    expect(Array.isArray(getDataB.messages)).toBe(true);
    expect(getDataB.messages.some((m: any) => m.content === msgA)).toBe(false);

    // 3. Client B sends a distinct message to Gen
    const msgB = `Hello from Client B ${Date.now()}`;
    const postResB = await request.post('/api/gen', {
      headers: { 'x-arondo-token': userBToken },
      data: { message: msgB },
    });
    expect(postResB.status()).toBe(200);
    const postDataB = await postResB.json();
    expect(postDataB.ok).toBe(true);
    expect(postDataB.userMessage.content).toBe(msgB);
    expect(postDataB.userMessage.tokenUuid).toBe(userBUuid);

    // Verify directory on filesystem: ${ARONDO_CONFIG_DIR}/gen/${userBUuid}
    expect(fsSync.existsSync(path.join(clientBDir, 'messages.json'))).toBe(true);
    const clientBMsgsRaw = await fs.readFile(path.join(clientBDir, 'messages.json'), 'utf-8');
    const clientBMessages = JSON.parse(clientBMsgsRaw);
    expect(clientBMessages.some((m: any) => m.content === msgB)).toBe(true);
    expect(clientBMessages.some((m: any) => m.content === msgA)).toBe(false);

    // 4. Verify Client A still does NOT see Client B's message
    const getResA = await request.get('/api/gen', {
      headers: { 'x-arondo-token': userAToken },
    });
    expect(getResA.status()).toBe(200);
    const getDataA = await getResA.json();
    expect(getDataA.messages.some((m: any) => m.content === msgA)).toBe(true);
    expect(getDataA.messages.some((m: any) => m.content === msgB)).toBe(false);
  });

  test('Gen sub-sessions are created inside the respective client sessions directory without modifying the session ID format', async () => {
    const { createSession, getGenSubSessions, getSession, deleteSession } = await import('../../lib/store');

    const subIdA = `gen-sub-${crypto.randomUUID()}`;
    const sessionA = await createSession(
      {
        id: subIdA,
        tokenUuid: userAUuid,
        runnerId: 'test-runner-1',
        repoPath: '/tmp/test-repo-a',
        agentType: 'auto',
        status: 'idle',
      },
      { noProject: true }
    );
    expect(sessionA.id).toBe(subIdA);

    // Verify sub-session A is written to: ${ARONDO_CONFIG_DIR}/gen/${userAUuid}/sessions/${subIdA}/session.json
    const expectedPathA = path.join(configDir, 'gen', userAUuid, 'sessions', subIdA, 'session.json');
    expect(fsSync.existsSync(expectedPathA)).toBe(true);

    // Verify getSession(subIdA) can read it back seamlessly
    const readBackA = await getSession(subIdA);
    expect(readBackA?.id).toBe(subIdA);
    expect(readBackA?.tokenUuid).toBe(userAUuid);

    // Verify Client B's sessions does NOT include sub-session A
    const subSessionsB = await getGenSubSessions(userBUuid);
    expect(subSessionsB.some((s) => s.id === subIdA)).toBe(false);

    // Verify Client A's sessions includes sub-session A
    const subSessionsA = await getGenSubSessions(userAUuid);
    expect(subSessionsA.some((s) => s.id === subIdA)).toBe(true);

    // Clean up
    await deleteSession(subIdA);
    expect(fsSync.existsSync(path.join(configDir, 'gen', userAUuid, 'sessions', subIdA))).toBe(false);
  });
});
