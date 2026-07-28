import { test, expect } from '@playwright/test';
import { canForceSend } from '../../lib/homeUtils';

// Regression tests for the "Project not ready" confirmation dialog offering a
// "Send now anyway" option that can never actually succeed. The backend
// (dispatchFollowupMessage in lib/session-actions.ts) unconditionally rejects
// a follow-up message with "Agent is already running for this session" when
// session.status is "running", even when force: true is passed. So whenever
// reason.busy is true, "Send now anyway" must not be offered at all.
test.describe('canForceSend (Send now anyway button visibility)', () => {
  test('is not offered when an agent is already running (busy)', () => {
    expect(canForceSend({ dirty: false, busy: true })).toBe(false);
  });

  test('is not offered when busy and dirty together', () => {
    expect(canForceSend({ dirty: true, busy: true })).toBe(false);
  });

  test('is not offered when busy with a message already queued ahead', () => {
    expect(canForceSend({ dirty: false, busy: true, queued: true })).toBe(false);
  });

  test('is offered when only the working tree is dirty (not busy)', () => {
    expect(canForceSend({ dirty: true, busy: false })).toBe(true);
  });

  test('is offered when only a message is queued (not busy)', () => {
    expect(canForceSend({ dirty: false, busy: false, queued: true })).toBe(true);
  });
});
