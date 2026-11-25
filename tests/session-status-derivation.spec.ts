import { test, expect } from '@playwright/test';
import { deriveSessionCompletion, type Message } from '../lib/store';

test.describe('deriveSessionCompletion tests', () => {
  test('returns idle when there are no completion messages', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        sessionId: 'sess-1',
        role: 'user',
        content: 'hello',
        createdAt: '2026-11-25T10:00:00.000Z',
      },
    ];
    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('idle');
    expect(completion.errorMessage).toBeUndefined();
  });

  test('returns needs_attention when a message is waiting for input', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        sessionId: 'sess-1',
        role: 'agent',
        content: 'Please approve this command',
        type: 'agent-return',
        waitingForInput: true,
        createdAt: '2026-11-25T10:00:00.000Z',
      },
    ];
    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('needs_attention');
  });

  test('returns needs_attention when the latest turn completed with error', () => {
    const messages: Message[] = [
      {
        id: 'run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Running agent',
        createdAt: '2026-11-25T10:00:00.000Z',
      },
      {
        id: 'ret-1',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'run-1',
        content: '❌ Error: Model failed to generate response',
        createdAt: '2026-11-25T10:01:00.000Z',
      },
    ];
    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('needs_attention');
    expect(completion.errorMessage).toBe('Model failed to generate response');
  });

  test('returns done when the latest turn succeeded', () => {
    const messages: Message[] = [
      {
        id: 'run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Running agent',
        createdAt: '2026-11-25T10:00:00.000Z',
      },
      {
        id: 'ret-1',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'run-1',
        content: '✅ Done!',
        createdAt: '2026-11-25T10:01:00.000Z',
      },
    ];
    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('done');
    expect(completion.errorMessage).toBeUndefined();
  });

  test('does not let an out-of-order delayed background script error overwrite subsequent successful user turns', () => {
    const messages: Message[] = [
      // Script started first
      {
        id: 'script-run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'script-run',
        content: '⚙️ Running script: ./build.sh',
        createdAt: '2026-11-24T03:36:56.466Z',
      },
      // User turn 1 initiated after script started
      {
        id: 'user-msg-1',
        sessionId: 'sess-1',
        role: 'user',
        type: 'chat-user',
        content: 'Please analyze script failure',
        createdAt: '2026-11-24T03:41:48.026Z',
      },
      {
        id: 'agent-run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Executing agent',
        createdAt: '2026-11-24T03:41:48.033Z',
      },
      {
        id: 'agent-ret-1',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'agent-run-1',
        content: '✅ Done!',
        createdAt: '2026-11-24T03:42:14.261Z',
      },
      // User turn 2 initiated even later
      {
        id: 'user-msg-2',
        sessionId: 'sess-1',
        role: 'user',
        type: 'chat-user',
        content: '/commit',
        createdAt: '2026-11-24T04:32:24.051Z',
      },
      {
        id: 'agent-run-2',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Executing agent',
        createdAt: '2026-11-24T04:32:24.066Z',
      },
      {
        id: 'agent-ret-2',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'agent-run-2',
        content: '✅ Done!',
        createdAt: '2026-11-24T04:32:52.989Z',
      },
      // The delayed script return arrives late in chronological wall-clock time
      {
        id: 'script-ret-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'script-return',
        parentId: 'script-run-1',
        content: '❌ Error: Script exited with code 1',
        createdAt: '2026-11-24T04:37:18.689Z',
      },
    ];

    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('done');
    expect(completion.errorMessage).toBeUndefined();
    expect(completion.completedAt).toBe('2026-11-24T04:32:52.989Z');
  });

  test('marks session as needs_attention if a script started after agent turn fails', () => {
    const messages: Message[] = [
      {
        id: 'agent-run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Executing agent',
        createdAt: '2026-11-24T03:00:00.000Z',
      },
      {
        id: 'agent-ret-1',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'agent-run-1',
        content: '✅ Done!',
        createdAt: '2026-11-24T03:01:00.000Z',
      },
      // Later script started after agent turn
      {
        id: 'script-run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'script-run',
        content: '⚙️ Running script: ./deploy.sh',
        createdAt: '2026-11-24T03:10:00.000Z',
      },
      {
        id: 'script-ret-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'script-return',
        parentId: 'script-run-1',
        content: '❌ Error: Script exited with code 1',
        createdAt: '2026-11-24T03:15:00.000Z',
      },
    ];

    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('needs_attention');
    expect(completion.errorMessage).toBe('Script exited with code 1');
  });

  test('supersedes previous errors when a newer turn succeeds', () => {
    const messages: Message[] = [
      {
        id: 'agent-run-1',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Executing agent',
        createdAt: '2026-11-24T03:00:00.000Z',
      },
      {
        id: 'agent-ret-1',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'agent-run-1',
        content: '❌ Error: Compilation failed',
        createdAt: '2026-11-24T03:01:00.000Z',
      },
      // User retries
      {
        id: 'agent-run-2',
        sessionId: 'sess-1',
        role: 'system',
        type: 'agent-run',
        content: 'Executing agent',
        createdAt: '2026-11-24T03:05:00.000Z',
      },
      {
        id: 'agent-ret-2',
        sessionId: 'sess-1',
        role: 'agent',
        type: 'agent-return',
        parentId: 'agent-run-2',
        content: '✅ Done!',
        createdAt: '2026-11-24T03:06:00.000Z',
      },
    ];

    const completion = deriveSessionCompletion(messages);
    expect(completion.status).toBe('done');
    expect(completion.errorMessage).toBeUndefined();
  });
});
