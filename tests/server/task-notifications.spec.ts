import { test, expect } from '@playwright/test';
import {
  TASK_COMPLETION_NOTIFICATION_DELAY_MS,
  shouldSendTaskNotification,
} from '../../lib/task-notifications';

test.describe('task notifications', () => {
  test('suppresses notifications for tasks shorter than one minute', () => {
    const startedAt = 1_000_000;

    expect(shouldSendTaskNotification(startedAt, startedAt + TASK_COMPLETION_NOTIFICATION_DELAY_MS - 1)).toBe(false);
  });

  test('sends notifications exactly one minute after a task starts', () => {
    const startedAt = 1_000_000;

    expect(shouldSendTaskNotification(startedAt, startedAt + TASK_COMPLETION_NOTIFICATION_DELAY_MS)).toBe(true);
  });
});
