import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ClientTokenResponse = {
  token: string;
  name?: string;
};

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

  // Regression test for an arondo.json corruption bug: concurrent
  // read-modify-write calls against arondo.json (e.g. several admins
  // creating tokens around the same time, or a token create racing a
  // runner reconnect's bindRunnerToken) used to interleave and could drop
  // tokens or corrupt the file. lib/auth.ts now serializes every mutation
  // through updateTokensConfig()'s per-file lock.
  test('concurrent client token creation does not corrupt arondo.json or drop tokens', async ({ request }) => {
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
    const tokens = await listRes.json() as ClientTokenResponse[];

    for (const name of names) {
      expect(tokens.some((t) => t.name === name)).toBeTruthy();
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

  test('settings stored in arondo.json survive token updates', async ({ request }) => {
    const settingsRes = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { sessionArchiveDays: 3, showHiddenFiles: false },
    });
    expect(settingsRes.status()).toBe(200);
    await expect(settingsRes.json()).resolves.toMatchObject({
      sessionArchiveDays: 3,
      showHiddenFiles: false,
    });

    const tokenRes = await request.post('/api/auth/client-tokens', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { name: `Settings Preservation ${crypto.randomUUID()}` },
    });
    expect(tokenRes.status()).toBe(200);
    const { token } = await tokenRes.json();

    const getSettingsRes = await request.get('/api/settings', {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(getSettingsRes.status()).toBe(200);
    await expect(getSettingsRes.json()).resolves.toMatchObject({
      sessionArchiveDays: 3,
      showHiddenFiles: false,
    });

    await request.delete(`/api/auth/client-tokens?role=user&token=${token}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
  });

  test('automodel API keys are saved but not returned by settings API', async ({ request }) => {
    const settingsRes = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        llmApiKeys: {
          ANTHROPIC_API_KEY: 'anthropic-test-key',
          OPENAI_API_KEY: 'openai-test-key',
          GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-key',
        },
      },
    });
    expect(settingsRes.status()).toBe(200);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.llmApiKeys.ANTHROPIC_API_KEY).toMatchObject({
      configured: true,
      source: 'settings',
      env: false,
    });
    expect(JSON.stringify(settingsBody)).not.toContain('anthropic-test-key');

    const configDir = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
    const raw = await fs.readFile(path.join(configDir, 'arondo.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.setitngs.llmApiKeys).toMatchObject({
      ANTHROPIC_API_KEY: 'anthropic-test-key',
      OPENAI_API_KEY: 'openai-test-key',
      GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-key',
    });

    const clearRes = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        llmApiKeys: {
          ANTHROPIC_API_KEY: null,
        },
      },
    });
    expect(clearRes.status()).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody.llmApiKeys.ANTHROPIC_API_KEY).toMatchObject({
      configured: false,
      source: 'none',
      env: false,
    });
  });
});
