import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { getConfigDir } from '../../lib/config';
import {
  createSession,
  addMessage,
  updateSession,
  getMessages,
  getSession,
  deleteSession,
  getPendingTodoMessages,
} from '../../lib/store';
import { heartbeatTick } from '../../lib/heartbeat';
import { getAgentQuotaErrorMessage } from '../../lib/agent-quota-errors';
import { runnerManager } from '../../lib/runner-manager';

test.describe('Heartbeat quota error handling tests', () => {
  const configDir = getConfigDir();
  const quotaFilePath = path.join(configDir, 'autoagent', 'agent', 'quota.json');

  test.beforeEach(async () => {
    await fs.mkdir(path.dirname(quotaFilePath), { recursive: true });
  });

  test('refreshes stale quota (>5m) and does not schedule message immediately', async () => {
    const session = await createSession({
      name: 'Stale Quota Session',
      agentType: 'antigravity',
      repoPath: '/tmp/test-repo-stale',
      runnerId: 'test-runner-1',
    });

    // Add user message and agent run
    await addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Please refactor this code',
      prompt: 'Please refactor this code',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: 'Executing command...',
      type: 'agent-run',
      resolvedAgentType: 'antigravity',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: `⚠️ ${getAgentQuotaErrorMessage('antigravity')}`,
      type: 'agent-return',
    });

    // Mark session as quota error
    await updateSession(session.id, {
      status: 'error',
      errorMessage: getAgentQuotaErrorMessage('antigravity'),
    });

    // Write stale quota (updated 10 minutes ago)
    const nowSec = Math.floor(Date.now() / 1000);
    const staleQuotas = {
      antigravity_acc_pro: {
        Type: 'antigravity',
        Account: 'acc',
        Plan: 'pro',
        GeminiHourRemain: 0,
        GeminiHourResetsAt: nowSec + 1800,
        GeminiWeeklyRemain: 0.5,
        GeminiWeeklyResetsAt: nowSec + 3600,
        updatedAt: nowSec - 600, // 10 minutes ago (> 5 min)
      },
    };
    await fs.writeFile(quotaFilePath, JSON.stringify(staleQuotas, null, 2), 'utf-8');

    let fetchCalled = false;
    let requestedAgent = '';
    const origSendFire = runnerManager.sendFire;
    runnerManager.sendFire = (runnerId: string, method: string, payload: any) => {
      if (method === 'info.fetch') {
        fetchCalled = true;
        requestedAgent = payload?.agent;
      }
    };

    try {
      await heartbeatTick();

      // Should have attempted to refresh quota
      // And should NOT have created a scheduled message yet
      const pendingTodos = await getPendingTodoMessages(session.id);
      expect(pendingTodos.length).toBe(0);
    } finally {
      runnerManager.sendFire = origSendFire;
      await deleteSession(session.id);
    }
  });

  test('converts message to scheduled message at resetTime + 5m when quota is fresh', async () => {
    const session = await createSession({
      name: 'Fresh Quota Session',
      agentType: 'claude',
      repoPath: '/tmp/test-repo-fresh',
      runnerId: 'test-runner-1',
    });

    await addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Write a parser function',
      prompt: 'Write a parser function',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: 'Executing command...',
      type: 'agent-run',
      resolvedAgentType: 'claude',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: `⚠️ ${getAgentQuotaErrorMessage('claude')}`,
      type: 'agent-return',
    });

    await updateSession(session.id, {
      status: 'error',
      errorMessage: getAgentQuotaErrorMessage('claude'),
    });

    // Write fresh quota (updated 1 minute ago) with future reset time (in 20 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    const resetTimeSec = nowSec + 1200; // 20 minutes from now
    const freshQuotas = {
      claude_acc_pro: {
        Type: 'claude',
        Account: 'acc',
        Plan: 'pro',
        HourRemain: 0,
        HourResetAt: resetTimeSec,
        WeekRemain: 0.8,
        WeekResetsAt: nowSec + 86400,
        updatedAt: nowSec - 60, // 1 minute ago (<= 5 min)
      },
    };
    await fs.writeFile(quotaFilePath, JSON.stringify(freshQuotas, null, 2), 'utf-8');

    try {
      await heartbeatTick();

      // Verify scheduled message was created
      const pendingTodos = await getPendingTodoMessages(session.id);
      expect(pendingTodos.length).toBe(1);

      const todo = pendingTodos[0];
      expect(todo.type).toBe('user-todo');
      expect(todo.todoStatus).toBe('pending');
      expect(todo.todoTrigger?.kind).toBe('at');
      expect(todo.content).toBe('Write a parser function');

      // Scheduled time should be resetTime + 5 minutes
      const expectedScheduledTime = resetTimeSec * 1000 + 5 * 60 * 1000;
      expect(todo.todoTrigger?.timestamp).toBe(expectedScheduledTime);

      const updated = await getSession(session.id);
      expect(updated?.pendingTodoMessageIds).toContain(todo.id);
    } finally {
      await deleteSession(session.id);
    }
  });

  test('falls back to now + 5m when reset time is in the past or missing', async () => {
    const session = await createSession({
      name: 'Past Reset Time Session',
      agentType: 'antigravity',
      repoPath: '/tmp/test-repo-past',
      runnerId: 'test-runner-1',
    });

    await addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Fix the failing tests',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: 'Executing command...',
      type: 'agent-run',
      resolvedAgentType: 'antigravity',
    });
    await addMessage({
      sessionId: session.id,
      role: 'system',
      content: `⚠️ ${getAgentQuotaErrorMessage('antigravity')}`,
      type: 'agent-return',
    });

    await updateSession(session.id, {
      status: 'error',
      errorMessage: getAgentQuotaErrorMessage('antigravity'),
    });

    // Write fresh quota (updated 30 seconds ago) but with reset time in the past
    const nowSec = Math.floor(Date.now() / 1000);
    const pastQuotas = {
      antigravity_acc_pro: {
        Type: 'antigravity',
        Account: 'acc',
        Plan: 'pro',
        GeminiHourRemain: 0,
        GeminiHourResetsAt: nowSec - 300, // 5 minutes ago (in the past)
        GeminiWeeklyRemain: 0.1,
        GeminiWeeklyResetsAt: nowSec - 100, // in the past
        updatedAt: nowSec - 30, // fresh quota
      },
    };
    await fs.writeFile(quotaFilePath, JSON.stringify(pastQuotas, null, 2), 'utf-8');

    const beforeTickMs = Date.now();
    try {
      await heartbeatTick();
      const afterTickMs = Date.now();

      const pendingTodos = await getPendingTodoMessages(session.id);
      expect(pendingTodos.length).toBe(1);

      const todo = pendingTodos[0];
      expect(todo.todoTrigger?.kind).toBe('at');

      // Scheduled timestamp should be approximately now + 5 minutes
      const scheduledTimestamp = todo.todoTrigger?.timestamp!;
      expect(scheduledTimestamp).toBeGreaterThanOrEqual(beforeTickMs + 5 * 60 * 1000);
      expect(scheduledTimestamp).toBeLessThanOrEqual(afterTickMs + 5 * 60 * 1000 + 1000);
    } finally {
      await deleteSession(session.id);
    }
  });

  test('ignores non-quota error sessions and sessions that already have pending todos', async () => {
    const session1 = await createSession({
      name: 'Normal Error Session',
      agentType: 'antigravity',
      repoPath: '/tmp/test-repo-normal-err',
      runnerId: 'test-runner-1',
    });
    await addMessage({
      sessionId: session1.id,
      role: 'user',
      content: 'Do something',
    });
    await updateSession(session1.id, {
      status: 'error',
      errorMessage: 'Agent exited with code 1',
    });

    const session2 = await createSession({
      name: 'Already Pending Session',
      agentType: 'antigravity',
      repoPath: '/tmp/test-repo-already-pending',
      runnerId: 'test-runner-1',
    });
    await addMessage({
      sessionId: session2.id,
      role: 'user',
      content: 'Already pending task',
      type: 'user-todo',
      todoStatus: 'pending',
      todoTrigger: { kind: 'manual' },
    });
    await updateSession(session2.id, {
      status: 'error',
      errorMessage: getAgentQuotaErrorMessage('antigravity'),
      pendingTodoMessageIds: ['some-id'],
    });

    try {
      await heartbeatTick();

      const todos1 = await getPendingTodoMessages(session1.id);
      expect(todos1.length).toBe(0);

      // session2 should not have additional todos added
      const messages2 = await getMessages(session2.id);
      expect(messages2.filter((m) => m.type === 'user-todo').length).toBe(1);
    } finally {
      await deleteSession(session1.id);
      await deleteSession(session2.id);
    }
  });
});
