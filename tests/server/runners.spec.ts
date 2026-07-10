import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('Runners API tests', () => {
  test('should allow listing runners for both admin and regular user', async ({ request }) => {
    // Admin
    const adminRes = await request.get('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(adminRes.ok()).toBeTruthy();

    // Regular User
    const userRes = await request.get('/api/runners', {
      headers: { 'x-arondo-token': 'test-user-token-7890' }
    });
    expect(userRes.ok()).toBeTruthy();
  });

  test('should reject POST /api/runners update with regular user token (403 Forbidden)', async ({ request }) => {
    const response = await request.post('/api/runners', {
      headers: { 'x-arondo-token': 'test-user-token-7890' },
      data: {
        id: 'some-runner-id',
        allowedUserTokenUuids: ['some-uuid']
      }
    });
    expect(response.status()).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Admin role required');
  });

  test('should reject DELETE /api/runners with regular user token (403 Forbidden)', async ({ request }) => {
    const response = await request.delete('/api/runners?id=some-runner-id', {
      headers: { 'x-arondo-token': 'test-user-token-7890' }
    });
    expect(response.status()).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Admin role required');
  });

  test('should return 400 Bad Request for POST /api/runners with invalid payload structure', async ({ request }) => {
    const response = await request.post('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        // missing fields
      }
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid payload');
  });

  test('should return 400 Bad Request for DELETE /api/runners with missing id parameter', async ({ request }) => {
    const response = await request.delete('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Missing runner id');
  });

  test('should return success: false when admin tries to update permissions for non-existing runner', async ({ request }) => {
    const response = await request.post('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        id: 'non-existing-runner-id',
        allowedUserTokenUuids: []
      }
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBeFalsy();
  });

  // Regression test: concurrent runner-token creation used to race on the
  // same tokens.json read-modify-write, potentially dropping a token that
  // another concurrent create had just written. Now serialized via
  // updateTokensConfig()'s per-file lock in lib/auth.ts.
  test('concurrent runner token creation does not corrupt tokens.json or drop tokens', async ({ request }) => {
    const total = 15;
    const names = Array.from({ length: total }, (_, i) => `Concurrent Runner Token ${crypto.randomUUID()}-${i}`);

    const createResponses = await Promise.all(
      names.map((name) =>
        request.post('/api/auth/runner-tokens', {
          headers: { 'x-arondo-token': 'test-token-123456' },
          data: { name },
        })
      )
    );

    for (const res of createResponses) {
      expect(res.status()).toBe(200);
    }

    const listRes = await request.get('/api/auth/runner-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(listRes.status()).toBe(200);
    const tokens = await listRes.json();

    for (const name of names) {
      expect(tokens.some((t: any) => t.name === name)).toBeTruthy();
    }

    // Clean up the tokens created by this test.
    const ids = tokens.filter((t: any) => names.includes(t.name)).map((t: any) => t.id);
    await Promise.all(
      ids.map((id: string) =>
        request.delete(`/api/auth/runner-tokens?id=${id}`, {
          headers: { 'x-arondo-token': 'test-token-123456' },
        })
      )
    );
  });
});
