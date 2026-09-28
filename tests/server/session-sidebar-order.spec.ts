import { test, expect } from '@playwright/test';
import { sortSessionsForSidebar } from '../../lib/homeUtils';
import type { Session } from '../../types/home';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    status: 'idle',
    agentType: 'codex',
    repoPath: '/tmp/test-repo',
    projectId: 'project-1',
    runnerId: 'runner-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('sorts newest unread successful completions before pinned sessions', () => {
  const sorted = sortSessionsForSidebar([
    session('pinned', { pinnedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }),
    session('completed-earlier', { status: 'done', completedAt: '2026-03-02T00:00:00.000Z' }),
    session('completed-latest', { status: 'done', completedAt: '2026-03-03T00:00:00.000Z' }),
    session('viewed-completed', {
      status: 'done',
      completedAt: '2026-03-04T00:00:00.000Z',
      lastViewedAt: '2026-03-04T00:00:00.000Z',
    }),
  ]);

  expect(sorted.map(({ id }) => id)).toEqual([
    'completed-latest',
    'completed-earlier',
    'pinned',
    'viewed-completed',
  ]);
});
