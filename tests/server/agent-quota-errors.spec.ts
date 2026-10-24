import { test, expect } from '@playwright/test';
import {
  getAgentQuotaErrorMessage,
  isQuotaErrorMessage,
} from '../../lib/agent-quota-errors';

test.describe('agent-quota-errors tests', () => {
  test('recognizes only Arondo-generated quota error markers', () => {
    expect(isQuotaErrorMessage(getAgentQuotaErrorMessage('antigravity'))).toBe(true);
    expect(isQuotaErrorMessage(getAgentQuotaErrorMessage('claude'))).toBe(true);
    expect(isQuotaErrorMessage('Agent exited with code 1')).toBe(false);
  });
});
