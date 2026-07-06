import { test, expect } from '@playwright/test';

test.describe('Server integration test', () => {
  test('should respond pong to GET /ping', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toBe('pong');
  });

  test('should return 403 on GET /api/runners without a valid token', async ({ request }) => {
    const response = await request.get('/api/runners');
    expect(response.status()).toBe(403);
  });

  test('should return list of runners on GET /api/runners with valid token', async ({ request }) => {
    const response = await request.get('/api/runners', {
      headers: {
        'x-arondo-token': 'test-token-123456'
      }
    });
    expect(response.ok()).toBeTruthy();
    const list = await response.json();
    expect(Array.isArray(list)).toBeTruthy();
  });
});
