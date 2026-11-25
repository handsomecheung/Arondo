import { test, expect } from '@playwright/test';
import { createSession, addMessage, deleteSession, getSession } from '../../lib/store';
import { runnerManager, type TaskContext } from '../../lib/runner-manager';

test.describe('script input wait session status', () => {
  test('sets needs_attention while waiting and restores script-running afterwards', async () => {
    const session = await createSession({ status: 'script-running', repoPath: '/unused', runnerId: 'input-wait-runner', agentType: 'codex' }, { automation: true });
    const taskId = 'script-input-wait-status-test';
    try {
      const run = await addMessage({ sessionId: session.id, role: 'system', type: 'script-run', content: 'read x', taskId });
      const ctx: TaskContext = {
        taskId,
        runnerId: 'input-wait-runner',
        sessionId: session.id,
        messageId: run.id,
        type: 'script',
        createdAt: Date.now(),
        command: 'read x',
      };
      (runnerManager as any).tasks.set(taskId, ctx);

      await (runnerManager as any).onExecInputWait({ taskId, waiting: true });
      expect((await getSession(session.id))?.status).toBe('needs_attention');

      await (runnerManager as any).onExecInputWait({ taskId, waiting: false });
      expect((await getSession(session.id))?.status).toBe('script-running');
    } finally {
      (runnerManager as any).tasks.delete(taskId);
      await deleteSession(session.id);
    }
  });
});
