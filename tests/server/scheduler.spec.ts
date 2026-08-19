import { test, expect } from '@playwright/test';
import { canDispatchAfterSessionTodo } from '../../lib/scheduler';

test.describe('scheduler script-running behavior', () => {
  test('allows afterSession todos after a successful agent run while scripts continue', () => {
    expect(canDispatchAfterSessionTodo({ status: 'script-running' })).toBe(true);
  });

  test('does not allow afterSession todos while an agent is running', () => {
    expect(canDispatchAfterSessionTodo({ status: 'running' })).toBe(false);
  });

  test('does not allow afterSession todos after an agent error while scripts continue', () => {
    expect(canDispatchAfterSessionTodo({
      status: 'script-running',
      errorMessage: 'Agent exited with code 1',
    })).toBe(false);
  });
});
