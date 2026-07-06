import { test, expect } from '@playwright/test';

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
});
