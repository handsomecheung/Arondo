import { test, expect } from '@playwright/test';
import { createSession, addMessage, appendSessionLog, deleteSession, getSession } from '../../lib/store';
import { runnerManager } from '../../lib/runner-manager';
import { eventBus } from '../../lib/event-bus';

test('agent failure completion events include the reason derived from the saved return message', async () => {
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalUrl = process.env.TYPESAFE_API_URL;
  const originalFetch = global.fetch;
  process.env.TYPESAFE_API_KEY = 'test-jev-key';
  process.env.TYPESAFE_API_URL = 'https://jev.test/systemone';
  global.fetch = (async () => new Response(JSON.stringify({
    answers: { failure_kind: { choice: 'invalid_model', confidence: 1 } },
  }), { status: 200 })) as typeof fetch;

  const session = await createSession({ status: 'running', repoPath: '/unused', runnerId: '', agentType: 'codex' }, { automation: true });
  const events: any[] = [];
  const unsubscribe = eventBus.subscribe(event => {
    if (event.type === 'session_updated' && event.payload?.id === session.id) events.push(event.payload);
  });
  try {
    const run = await addMessage({ sessionId: session.id, role: 'system', type: 'agent-run', content: 'codex exec', resolvedAgentType: 'codex' });
    await appendSessionLog(session.id, run.id, 'agent', 'The selected model is not supported for this account.', true, undefined, 'stderr');
    await (runnerManager as any).handleAgentExit({ sessionId: session.id, messageId: run.id, runnerId: '', taskId: 'failed-model-test', createdAt: Date.now(), type: 'agent' }, 1);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('error');
    expect(events[0].errorMessage).toBe('Invalid model selection. Update the model in Admin Settings.');
    expect((await getSession(session.id))?.errorMessage).toBe(events[0].errorMessage);
  } finally {
    unsubscribe();
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.TYPESAFE_API_URL;
    else process.env.TYPESAFE_API_URL = originalUrl;
    await deleteSession(session.id);
  }
});
