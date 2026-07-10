import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('Agent commands API tests', () => {
  test('should reject POST /api/agent-commands with regular user token (403 Forbidden)', async ({ request }) => {
    const response = await request.post('/api/agent-commands', {
      headers: { 'x-arondo-token': 'test-user-token-7890' },
      data: { command: 'foo', send: 'bar' },
    });
    expect(response.status()).toBe(403);
  });

  test('should create and then delete a custom agent command', async ({ request }) => {
    const command = `test-cmd-${crypto.randomUUID()}`;

    const createRes = await request.post('/api/agent-commands', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { command, send: 'do the thing' },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    expect(created.some((c: any) => c.command === command)).toBeTruthy();

    const deleteRes = await request.delete(`/api/agent-commands?command=${command}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(deleteRes.status()).toBe(200);
    const afterDelete = await deleteRes.json();
    expect(afterDelete.some((c: any) => c.command === command)).toBeFalsy();
  });

  // Regression test: agent-commands.json used the same unlocked
  // read-modify-write pattern as tokens.json and messages.json. Concurrent
  // POSTs used to be able to race and drop one another's command. Now
  // serialized via updateCustomCommands()'s per-file lock.
  test('concurrent custom command creation does not corrupt agent-commands.json or drop commands', async ({ request }) => {
    const total = 15;
    const commands = Array.from({ length: total }, () => `test-cmd-${crypto.randomUUID()}`);

    const createResponses = await Promise.all(
      commands.map((command) =>
        request.post('/api/agent-commands', {
          headers: { 'x-arondo-token': 'test-token-123456' },
          data: { command, send: `do ${command}` },
        })
      )
    );

    for (const res of createResponses) {
      expect(res.status()).toBe(200);
    }

    const listRes = await request.get('/api/agent-commands?source=custom', {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(listRes.status()).toBe(200);
    const custom = await listRes.json();

    for (const command of commands) {
      expect(custom.some((c: any) => c.command === command)).toBeTruthy();
    }

    // Clean up sequentially to avoid racing our own deletes against each other.
    for (const command of commands) {
      await request.delete(`/api/agent-commands?command=${command}`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
      });
    }
  });
});
