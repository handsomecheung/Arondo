import { test, expect } from '@playwright/test';
import { canForceSend } from '../../lib/homeUtils';

// A new session can force-send despite another agent running on the same
// project. A follow-up cannot force-send while its own agent is running.
test.describe('canForceSend (Send now anyway button visibility)', () => {
  test('is not offered for a follow-up when its agent is already running', () => {
    expect(canForceSend({ dirty: false, busy: true }, true)).toBe(false);
  });

  test('is not offered for a follow-up when busy and dirty together', () => {
    expect(canForceSend({ dirty: true, busy: true }, true)).toBe(false);
  });

  test('is not offered for a follow-up when busy with a message already queued ahead', () => {
    expect(canForceSend({ dirty: false, busy: true, queued: true }, true)).toBe(false);
  });

  test('is offered for a new session when another project agent is running', () => {
    expect(canForceSend({ dirty: false, busy: true }, false)).toBe(true);
  });

  test('is offered when only the working tree is dirty (not busy)', () => {
    expect(canForceSend({ dirty: true, busy: false })).toBe(true);
  });

  test('is offered when only a message is queued (not busy)', () => {
    expect(canForceSend({ dirty: false, busy: false, queued: true })).toBe(true);
  });
});
