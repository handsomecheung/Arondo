import { test, expect } from '@playwright/test';
import { createSession, deleteSession } from '../../lib/store';
import { runnerManager } from '../../lib/runner-manager';
import { dispatchFollowupMessage } from '../../lib/session-actions';

const mockRunnerId = 'path-check-mock-runner';

test.describe('path check failure vs non-existence discrimination', () => {
  test.beforeEach(() => {
    (runnerManager as any).runners.set(mockRunnerId, {
      id: mockRunnerId,
      ws: {},
      info: { id: mockRunnerId, name: 'Mock Runner', agents: ['agy'] },
    });
  });

  test.afterEach(() => {
    (runnerManager as any).runners.delete(mockRunnerId);
  });

  test('checkPathExists returns true when runner reports file exists', async () => {
    const origSendRequest = runnerManager.sendRequest;
    try {
      runnerManager.sendRequest = async (_id: string, method: string, payload: any) => {
        if (method === 'fs.infos') {
          return { ok: true, results: { [payload.paths[0]]: { exists: true, isDir: true } } };
        }
        throw new Error('Unexpected method ' + method);
      };

      const exists = await runnerManager.checkPathExists(mockRunnerId, '/valid/path');
      expect(exists).toBe(true);
    } finally {
      runnerManager.sendRequest = origSendRequest;
    }
  });

  test('checkPathExists returns false when runner explicitly confirms file does not exist', async () => {
    const origSendRequest = runnerManager.sendRequest;
    try {
      runnerManager.sendRequest = async (_id: string, method: string, payload: any) => {
        if (method === 'fs.infos') {
          return { ok: true, results: { [payload.paths[0]]: { exists: false } } };
        }
        throw new Error('Unexpected method ' + method);
      };

      const exists = await runnerManager.checkPathExists(mockRunnerId, '/missing/path');
      expect(exists).toBe(false);
    } finally {
      runnerManager.sendRequest = origSendRequest;
    }
  });

  test('checkPathExists throws error on runner request timeout instead of returning false', async () => {
    const origSendRequest = runnerManager.sendRequest;
    try {
      runnerManager.sendRequest = async (_id: string, method: string) => {
        throw new Error(`Request ${method} timed out after 5000ms`);
      };

      await expect(
        runnerManager.checkPathExists(mockRunnerId, '/any/path')
      ).rejects.toThrow('Request fs.infos timed out after 5000ms');
    } finally {
      runnerManager.sendRequest = origSendRequest;
    }
  });

  test('dispatchFollowupMessage returns 400 when path does not exist and 503 on timeout', async () => {
    const session = await createSession({
      status: 'done',
      repoPath: '/test/repo',
      runnerId: mockRunnerId,
      agentType: 'agy',
    });

    const origSendRequest = runnerManager.sendRequest;
    try {
      // 1. Path does not exist -> 400
      runnerManager.sendRequest = async (_id: string, method: string, payload: any) => {
        if (method === 'fs.infos') {
          return { ok: true, results: { [payload.paths[0]]: { exists: false } } };
        }
        throw new Error('Unexpected method ' + method);
      };

      const notFoundRes = await dispatchFollowupMessage(session.id, 'hello');
      expect(notFoundRes.ok).toBe(false);
      expect(notFoundRes.status).toBe(400);
      expect(notFoundRes.error).toBe('Session path does not exist on runner');

      // 2. Runner times out -> 503
      runnerManager.sendRequest = async (_id: string, method: string) => {
        throw new Error(`Request ${method} timed out after 5000ms`);
      };

      const timeoutRes = await dispatchFollowupMessage(session.id, 'hello');
      expect(timeoutRes.ok).toBe(false);
      expect(timeoutRes.status).toBe(503);
      expect(timeoutRes.error).toContain('Failed to verify session path on runner: Request fs.infos timed out after 5000ms');
    } finally {
      runnerManager.sendRequest = origSendRequest;
      await deleteSession(session.id);
    }
  });

  test('checkPathsExist throws error on runner timeout instead of marking paths as non-existent', async () => {
    const origSendRequest = runnerManager.sendRequest;
    try {
      runnerManager.sendRequest = async (_id: string, method: string) => {
        throw new Error(`Request ${method} timed out after 5000ms`);
      };

      await expect(
        runnerManager.checkPathsExist(mockRunnerId, ['/repo/a', '/repo/b'])
      ).rejects.toThrow('Request fs.infos timed out after 5000ms');
    } finally {
      runnerManager.sendRequest = origSendRequest;
    }
  });
});
