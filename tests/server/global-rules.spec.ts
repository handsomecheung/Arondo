import { test, expect } from '@playwright/test';

test.describe('Global Rules API tests', () => {
  test('should return empty content initially or read existing rules file', async ({ request }) => {
    const response = await request.get('/api/global-rules', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('content');
    expect(typeof json.content).toBe('string');
  });

  test('should allow admin to update global rules content', async ({ request }) => {
    const testContent = '# Test Custom Global Rules\n\nRule 1: Always compile.';
    
    // Save rules
    const postRes = await request.post('/api/global-rules', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { content: testContent }
    });
    expect(postRes.status()).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBeTruthy();

    // Verify rules were updated
    const getRes = await request.get('/api/global-rules', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(getRes.status()).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.content).toBe(testContent);
  });

  test('should reject regular user from saving global rules (403 Forbidden)', async ({ request }) => {
    const response = await request.post('/api/global-rules', {
      headers: { 'x-arondo-token': 'test-user-token-7890' },
      data: { content: '# Should fail' }
    });
    expect(response.status()).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Admin role required');
  });
});
