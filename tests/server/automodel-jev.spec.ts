import { test, expect } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { routeModel } from '../../lib/llm/automodel';
import { getJevConfig } from '../../lib/llm/config';
import { getInnerAutomodelMethod } from '../../lib/config';

test.describe('Jev System One Automodel Tests', () => {
  const originalEnable = process.env.ARONDO_ENABLE_AUTOMODEL;
  const originalMethod = process.env.ARONDO_INNER_AUTOMODEL_METHOD;
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalUrl = process.env.TYPESAFE_API_URL;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  test.afterEach(() => {
    if (originalEnable !== undefined) process.env.ARONDO_ENABLE_AUTOMODEL = originalEnable;
    else delete process.env.ARONDO_ENABLE_AUTOMODEL;

    if (originalMethod !== undefined) process.env.ARONDO_INNER_AUTOMODEL_METHOD = originalMethod;
    else delete process.env.ARONDO_INNER_AUTOMODEL_METHOD;

    if (originalKey !== undefined) process.env.TYPESAFE_API_KEY = originalKey;
    else delete process.env.TYPESAFE_API_KEY;

    if (originalUrl !== undefined) process.env.TYPESAFE_API_URL = originalUrl;
    else delete process.env.TYPESAFE_API_URL;

    if (originalAnthropicKey !== undefined) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    else delete process.env.ANTHROPIC_API_KEY;

    if (originalOpenAiKey !== undefined) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;

    if (originalGoogleKey !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
    else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  test('getInnerAutomodelMethod env validation', () => {
    delete process.env.ARONDO_INNER_AUTOMODEL_METHOD;
    expect(getInnerAutomodelMethod()).toBe('DM');

    process.env.ARONDO_INNER_AUTOMODEL_METHOD = '';
    expect(getInnerAutomodelMethod()).toBe('DM');

    process.env.ARONDO_INNER_AUTOMODEL_METHOD = '  llm ';
    expect(getInnerAutomodelMethod()).toBe('LLM');

    process.env.ARONDO_INNER_AUTOMODEL_METHOD = '  dm ';
    expect(getInnerAutomodelMethod()).toBe('DM');

    process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'INVALID';
    expect(() => getInnerAutomodelMethod()).toThrow(/Invalid ARONDO_INNER_AUTOMODEL_METHOD/);
  });

  test('getJevConfig returns correct config when TYPESAFE_API_KEY is present', () => {
    process.env.TYPESAFE_API_KEY = 'test-jev-key-123';
    const cfg = getJevConfig(1500);
    expect(cfg).not.toBeNull();
    expect(cfg?.apiKey).toBe('test-jev-key-123');
    expect(cfg?.model).toBe('jev-latest');
    expect(cfg?.timeoutMs).toBe(1500);
  });

  test('routeModel routes successfully via Jev when configured', async () => {
    let receivedPayload: any = null;
    let authHeader: string | undefined = undefined;

    const server = http.createServer((req, res) => {
      authHeader = req.headers['authorization'];
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            answers: {
              choiceId: {
                choice: 'claude-sonnet-4-6',
                probabilities: {
                  'claude-sonnet-4-6': 0.92,
                },
              },
              taskClass: {
                choice: 'question',
              },
              costTier: {
                choice: 'cheap',
              },
            },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      process.env.ARONDO_ENABLE_AUTOMODEL = 'true';
      process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'DM';
      process.env.TYPESAFE_API_KEY = 'mock-jev-secret';
      process.env.TYPESAFE_API_URL = `http://127.0.0.1:${port}/v1/systemone`;

      let logOutput = '';
      const decision = await routeModel(
        {
          agentType: 'antigravity',
          defaultModel: 'claude-haiku',
          message: 'Can you explain how this works?',
          modelOptions: [
            { id: 'claude-haiku', model: 'claude-haiku', costTier: 'cheap', description: 'Fast and cheap' },
            { id: 'claude-sonnet-4-6', model: 'claude-sonnet-4-6', effort: 'high', costTier: 'strong', description: 'Strong reasoning' },
          ],
        },
        {
          writeLog: (text) => {
            logOutput += text;
          },
        },
      );

      expect(authHeader).toBe('Bearer mock-jev-secret');
      expect(receivedPayload).toMatchObject({
        model: 'jev-latest',
        questions: {
          choiceId: { type: 'choice' },
          taskClass: { type: 'choice' },
        },
      });
      expect(decision).toMatchObject({
        model: 'claude-sonnet-4-6',
        effort: 'high',
        taskClass: 'question',
        costTier: 'cheap',
        confidence: 0.92,
      });
      expect(logOutput).toContain('Selected by Jev System One');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('routeModel skips Jev when ARONDO_INNER_AUTOMODEL_METHOD is LLM', async () => {
    let jevCalled = false;
    const server = http.createServer((_req, res) => {
      jevCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      process.env.ARONDO_ENABLE_AUTOMODEL = 'true';
      process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'LLM';
      process.env.TYPESAFE_API_KEY = 'mock-jev-secret';
      process.env.TYPESAFE_API_URL = `http://127.0.0.1:${port}/v1/systemone`;

      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      let logOutput = '';
      const decision = await routeModel(
        {
          agentType: 'antigravity',
          defaultModel: 'claude-haiku',
          message: 'Can you explain this?',
          modelOptions: [{ id: 'claude-haiku', model: 'claude-haiku', costTier: 'cheap', description: 'Fast and cheap' }],
        },
        {
          writeLog: (text) => {
            logOutput += text;
          },
        },
      );

      expect(jevCalled).toBe(false);
      expect(decision).toBeNull();
      expect(logOutput).toContain('Method\nLLM');
      expect(logOutput).not.toContain('Config (Jev)');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('routeModel falls back gracefully when Jev fails', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Internal Server Error' } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    const configDir = process.env.ARONDO_CONFIG_DIR || path.join(os.homedir(), '.arondo');
    const configFile = path.join(configDir, 'arondo.json');
    let originalConfig: string | null = null;
    if (fs.existsSync(configFile)) {
      originalConfig = fs.readFileSync(configFile, 'utf-8');
      try {
        const parsed = JSON.parse(originalConfig);
        if (parsed.setitngs?.llmApiKeys) {
          delete parsed.setitngs.llmApiKeys;
          fs.writeFileSync(configFile, JSON.stringify(parsed, null, 2));
        }
      } catch {}
    }

    try {
      process.env.ARONDO_ENABLE_AUTOMODEL = 'true';
      process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'DM';
      process.env.TYPESAFE_API_KEY = 'mock-jev-secret';
      process.env.TYPESAFE_API_URL = `http://127.0.0.1:${port}/v1/systemone`;

      // Clear any standard LLM keys so fallback terminates cleanly without network call
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      let logOutput = '';
      const decision = await routeModel(
        {
          agentType: 'antigravity',
          defaultModel: 'claude-haiku',
          message: 'Can you fix this?',
          modelOptions: [{ id: 'claude-haiku', model: 'claude-haiku', costTier: 'cheap', description: 'Fast and cheap' }],
        },
        {
          writeLog: (text) => {
            logOutput += text;
          },
        },
      );

      // Since Jev failed and no fallback LLM was configured, decision is null
      expect(decision).toBeNull();
      expect(logOutput).toContain('Jev Fallback');
      expect(logOutput).toContain('no automodel API key configured');
    } finally {
      if (originalConfig !== null) {
        try {
          const configDir = process.env.ARONDO_CONFIG_DIR || path.join(os.homedir(), '.arondo');
          fs.writeFileSync(path.join(configDir, 'arondo.json'), originalConfig);
        } catch {}
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
