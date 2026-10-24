import { test, expect } from '@playwright/test';
import { classifyAgentFailure } from '../../lib/agent-failure-classifier';

test.describe('agent failure classifier', () => {
  test('reports that classification is unavailable when Jev is not configured', async () => {
    const originalTypesafeKey = process.env.TYPESAFE_API_KEY;
    const originalJevKey = process.env.JEV_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.JEV_API_KEY;

    try {
      const result = await classifyAgentFailure({
        agentType: 'claude',
        exitCode: 1,
        command: 'claude',
        stdout: '',
        stderr: '',
      });
      expect(result).toEqual({ status: 'unavailable', reason: 'not_configured' });
    } finally {
      if (originalTypesafeKey === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = originalTypesafeKey;
      if (originalJevKey === undefined) delete process.env.JEV_API_KEY;
      else process.env.JEV_API_KEY = originalJevKey;
    }
  });

  test('uses Jev to return the supplied exclusive failure category', async () => {
    const originalKey = process.env.TYPESAFE_API_KEY;
    const originalUrl = process.env.TYPESAFE_API_URL;
    const originalFetch = global.fetch;
    let request: any;
    process.env.TYPESAFE_API_KEY = 'test-jev-key';
    process.env.TYPESAFE_API_URL = 'https://jev.test/systemone';
    global.fetch = (async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        answers: { failure_kind: { choice: 'quota_exhausted', confidence: 0.91 } },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await classifyAgentFailure({
        agentType: 'antigravity',
        exitCode: 1,
        command: 'agy --model example',
        stdout: 'output',
        stderr: 'error',
      });

      expect(result).toEqual({ status: 'classified', kind: 'quota_exhausted', confidence: 0.91 });
      expect(request.questions.failure_kind.criteria).toHaveProperty('invalid_model');
      expect(request.questions.failure_kind.criteria).toHaveProperty('arondo_parameter_error');
    } finally {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = originalKey;
      if (originalUrl === undefined) delete process.env.TYPESAFE_API_URL;
      else process.env.TYPESAFE_API_URL = originalUrl;
    }
  });
});
