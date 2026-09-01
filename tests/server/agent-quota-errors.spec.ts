import { test, expect } from '@playwright/test';
import {
  isAgentQuotaExhausted,
  isAgyInvalidModelError,
  getAgyInvalidModelErrorMessage,
  getAgentQuotaErrorMessage,
} from '../../lib/agent-quota-errors';

test.describe('agent-quota-errors tests', () => {
  test('detects invalid model selection error from antigravity logs', () => {
    const errorLog = 'Error: invalid model selection (--model "Gemini 3.5 Flash (Medium)" --effort ""): model Gemini 3.5 Flash (Medium) is not recognized as a known model or custom model in settings';
    expect(isAgyInvalidModelError(errorLog)).toBe(true);
    expect(isAgyInvalidModelError('Some other error occurred')).toBe(false);
  });

  test('returns user-friendly error message for invalid model selection', () => {
    const msg = getAgyInvalidModelErrorMessage();
    expect(msg).toContain('Settings');
    expect(msg).toContain('Auto mode');
  });

  test('detects quota exhaustion errors correctly', () => {
    expect(isAgentQuotaExhausted('antigravity', 'individual quota reached', false)).toBe(true);
    expect(isAgentQuotaExhausted('claude', "you've hit your session limit", false)).toBe(true);
    expect(isAgentQuotaExhausted('antigravity', 'other regular log output', false)).toBe(false);
  });
});
