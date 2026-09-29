import { test, expect } from '@playwright/test';

test.describe('Web Push (VAPID) Notifications API', () => {
  const validToken = 'test-token-123456';

  test('should reject GET /api/notifications/vapid-public-key without token (401)', async ({ request }) => {
    const res = await request.get('/api/notifications/vapid-public-key');
    expect(res.status()).toBe(401);
  });

  test('should return VAPID public key with valid token', async ({ request }) => {
    const res = await request.get('/api/notifications/vapid-public-key', {
      headers: { 'x-arondo-token': validToken },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.publicKey).toBe('string');
    expect(data.publicKey.length).toBeGreaterThan(20);
  });

  test('should register and unregister a web push subscription', async ({ request }) => {
    const dummySubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/dummy-test-endpoint-123',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    };

    // Register
    const subRes = await request.post('/api/notifications/subscribe', {
      headers: { 'x-arondo-token': validToken },
      data: { subscription: dummySubscription },
    });
    expect(subRes.status()).toBe(200);
    const subData = await subRes.json();
    expect(subData.success).toBe(true);

    // Unregister
    const unsubRes = await request.post('/api/notifications/unsubscribe', {
      headers: { 'x-arondo-token': validToken },
      data: { endpoint: dummySubscription.endpoint },
    });
    expect(unsubRes.status()).toBe(200);
    const unsubData = await unsubRes.json();
    expect(unsubData.success).toBe(true);
    expect(unsubData.removed).toBe(true);
  });

  test('should trigger immediate or delayed test notification', async ({ request }) => {
    // Delayed test notification (default 30s)
    const delayedRes = await request.post('/api/notifications/test', {
      headers: { 'x-arondo-token': validToken },
      data: { delaySeconds: 30 },
    });
    expect(delayedRes.status()).toBe(200);
    const delayedData = await delayedRes.json();
    expect(delayedData.success).toBe(true);
    expect(delayedData.delayed).toBe(true);
    expect(delayedData.delaySeconds).toBe(30);

    // Immediate test notification (delaySeconds: 0)
    const immediateRes = await request.post('/api/notifications/test', {
      headers: { 'x-arondo-token': validToken },
      data: { delaySeconds: 0 },
    });
    expect(immediateRes.status()).toBe(200);
    const immediateData = await immediateRes.json();
    expect(immediateData.success).toBe(true);
  });

  test('should get and update webPushContactEmail without mailto prefix', async ({ request }) => {
    // Update contact email without mailto:
    const updateRes = await request.post('/api/settings', {
      headers: { 'x-arondo-token': validToken },
      data: { webPushContactEmail: 'custom-admin@example.com' },
    });
    expect(updateRes.status()).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.webPushContactEmail).toBe('custom-admin@example.com');

    // Get settings and verify
    const getRes = await request.get('/api/settings', {
      headers: { 'x-arondo-token': validToken },
    });
    expect(getRes.status()).toBe(200);
    const getData = await getRes.json();
    expect(getData.webPushContactEmail).toBe('custom-admin@example.com');
  });
});
