import { test, expect } from '@playwright/test';
import { getInnerRunnerQuotaMethod } from '../../lib/config';

test.describe('ARONDO_INNER_RUNNER_QUOTA_METHOD env tests', () => {
  const originalEnv = process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD;

  test.afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = originalEnv;
    } else {
      delete process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD;
    }
  });

  test('defaults to AUTO when unset or empty', () => {
    delete process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD;
    expect(getInnerRunnerQuotaMethod()).toBe('AUTO');

    process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = '';
    expect(getInnerRunnerQuotaMethod()).toBe('AUTO');

    process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = '  auto ';
    expect(getInnerRunnerQuotaMethod()).toBe('AUTO');
  });

  test('returns LLM when set to LLM (case-insensitive)', () => {
    process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = 'LLM';
    expect(getInnerRunnerQuotaMethod()).toBe('LLM');

    process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = 'llm';
    expect(getInnerRunnerQuotaMethod()).toBe('LLM');
  });

  test('throws descriptive error on invalid value', () => {
    process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD = 'INVALID';
    expect(() => getInnerRunnerQuotaMethod()).toThrow(/Invalid ARONDO_INNER_RUNNER_QUOTA_METHOD/);
  });
});
