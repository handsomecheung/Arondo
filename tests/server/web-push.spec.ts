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

  test('should isolate push notifications per client token UUID', async ({ request }) => {
    // 1. Create client token for User A
    const resA = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': validToken },
      data: { name: 'User-A-Push', type: 'user' },
    });
    expect(resA.status()).toBe(200);
    const dataA = await resA.json();
    const tokenA = dataA.token;

    // 2. Create client token for User B
    const resB = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': validToken },
      data: { name: 'User-B-Push', type: 'user' },
    });
    expect(resB.status()).toBe(200);
    const dataB = await resB.json();
    const tokenB = dataB.token;

    const subA = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub-user-a',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    };

    const subB = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub-user-b',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    };

    try {
      // User A subscribes
      const regA = await request.post('/api/notifications/subscribe', {
        headers: { 'x-arondo-token': tokenA },
        data: { subscription: subA },
      });
      expect(regA.status()).toBe(200);

      // User B subscribes
      const regB = await request.post('/api/notifications/subscribe', {
        headers: { 'x-arondo-token': tokenB },
        data: { subscription: subB },
      });
      expect(regB.status()).toBe(200);

      // User A triggers immediate test push -> attempts delivery to only 1 subscription (User A's)
      const testPushA = await request.post('/api/notifications/test', {
        headers: { 'x-arondo-token': tokenA },
        data: { delaySeconds: 0 },
      });
      expect(testPushA.status()).toBe(200);
      const pushDataA = await testPushA.json();
      // Since the endpoint is dummy FCM, it will fail 1 delivery, sent + failed must equal exactly 1 (only user A's subscription)
      expect(pushDataA.sent + pushDataA.failed).toBe(1);

      // A user without any subscriptions triggers test push -> targets 0 subscriptions
      const resC = await request.post('/api/auth/client-tokens', {
        headers: { 'x-arondo-token': validToken },
        data: { name: 'User-C-Push', type: 'user' },
      });
      const tokenC = (await resC.json()).token;

      const testPushC = await request.post('/api/notifications/test', {
        headers: { 'x-arondo-token': tokenC },
        data: { delaySeconds: 0 },
      });
      expect(testPushC.status()).toBe(200);
      const pushDataC = await testPushC.json();
      expect(pushDataC.sent).toBe(0);
      expect(pushDataC.failed).toBe(0);

      await request.delete(`/api/auth/client-tokens?role=user&token=${tokenC}`, {
        headers: { 'x-arondo-token': validToken },
      });
    } finally {
      await request.post('/api/notifications/unsubscribe', {
        headers: { 'x-arondo-token': tokenA },
        data: { endpoint: subA.endpoint },
      });
      await request.post('/api/notifications/unsubscribe', {
        headers: { 'x-arondo-token': tokenB },
        data: { endpoint: subB.endpoint },
      });
      await request.delete(`/api/auth/client-tokens?role=user&token=${tokenA}`, {
        headers: { 'x-arondo-token': validToken },
      });
      await request.delete(`/api/auth/client-tokens?role=user&token=${tokenB}`, {
        headers: { 'x-arondo-token': validToken },
      });
    }
  });
});
