import { test, expect } from '@playwright/test';
import { getConfirmationButtons } from '../../lib/homeUtils';

// New-session flow: creating a session against a dirty (uncommitted changes)
// but otherwise idle codebase is the "dirty only, not busy" case. Unlike the
// busy case (see project-not-ready.spec.ts), force-send is actually viable
// here — dispatchFollowupMessage/session creation only rejects on force when
// an agent is already running, not on a dirty tree. The dialog must offer
// all three choices, each labeled exactly as below, in this order.
test.describe('getConfirmationButtons for new-session codebases', () => {
  test('returns exactly three buttons with the expected names', () => {
    const buttons = getConfirmationButtons({ dirty: true, busy: false }, false);

    expect(buttons.map((b) => b.label)).toEqual([
      'Send automatically once ready',
      'Save as draft, send manually later',
      'Send now anyway',
    ]);
  });

  test('returns exactly three buttons when another agent is running on the project', () => {
    const buttons = getConfirmationButtons({ dirty: false, busy: true }, false);

    expect(buttons.map((b) => b.label)).toEqual([
      'Send automatically once ready',
      'Save as draft, send manually later',
      'Send now anyway',
    ]);
  });
});
