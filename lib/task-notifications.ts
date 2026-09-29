export const TASK_COMPLETION_NOTIFICATION_DELAY_MS = 60_000;

export function shouldSendTaskNotification(
  taskStartedAt: number,
  notificationTime = Date.now(),
): boolean {
  return notificationTime - taskStartedAt >= TASK_COMPLETION_NOTIFICATION_DELAY_MS;
}
