import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('Authentication API tests', () => {
  test('should allow public access to GET /ping without tokens', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toBe('pong');
  });

  test('should reject GET /api/runners without a token (403 Forbidden)', async ({ request }) => {
    const response = await request.get('/api/runners');
    expect(response.status()).toBe(403);
  });

  test('should reject GET /api/runners with invalid token (403 Forbidden)', async ({ request }) => {
    const response = await request.get('/api/runners', {
      headers: {
        'x-arondo-token': 'invalid-token-value'
      }
    });
    expect(response.status()).toBe(403);
  });

  test('should reject GET /api/global-rules without a token (401 Unauthorized)', async ({ request }) => {
    const response = await request.get('/api/global-rules');
    expect(response.status()).toBe(401);
  });

  test('should reject GET /api/global-rules with invalid token (401 Unauthorized)', async ({ request }) => {
    const response = await request.get('/api/global-rules', {
      headers: {
        'x-arondo-token': 'invalid-token-value'
      }
    });
    expect(response.status()).toBe(401);
  });

  test('should authenticate GET /api/runners with token via x-arondo-token header', async ({ request }) => {
    const response = await request.get('/api/runners', {
      headers: {
        'x-arondo-token': 'test-token-123456'
      }
    });
    expect(response.status()).toBe(200);
    const list = await response.json();
    expect(Array.isArray(list)).toBeTruthy();
  });

  test('should authenticate GET /api/runners with token via query parameter', async ({ request }) => {
    const response = await request.get('/api/runners?token=test-token-123456');
    expect(response.status()).toBe(200);
    const list = await response.json();
    expect(Array.isArray(list)).toBeTruthy();
  });

  // Regression test for a tokens.json corruption bug: concurrent
  // read-modify-write calls against tokens.json (e.g. several admins
  // creating tokens around the same time, or a token create racing a
  // runner reconnect's bindRunnerToken) used to interleave and could drop
  // tokens or corrupt the file. lib/auth.ts now serializes every mutation
  // through updateTokensConfig()'s per-file lock.
  test('concurrent client token creation does not corrupt tokens.json or drop tokens', async ({ request }) => {
    const total = 15;
    const names = Array.from({ length: total }, (_, i) => `Concurrent Token ${crypto.randomUUID()}-${i}`);

    const createResponses = await Promise.all(
      names.map((name) =>
        request.post('/api/auth/client-tokens', {
          headers: { 'x-arondo-token': 'test-token-123456' },
          data: { name },
        })
      )
    );

    for (const res of createResponses) {
      expect(res.status()).toBe(200);
    }

    const listRes = await request.get('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(listRes.status()).toBe(200);
    const tokens = await listRes.json();

    for (const name of names) {
      expect(tokens.some((t: any) => t.name === name)).toBeTruthy();
    }

    // Clean up the tokens created by this test.
    await Promise.all(
      (await Promise.all(
        createResponses.map((res) => res.json())
      )).map(({ token }) =>
        request.delete(`/api/auth/client-tokens?role=user&token=${token}`, {
          headers: { 'x-arondo-token': 'test-token-123456' },
        })
      )
    );
  });
});
