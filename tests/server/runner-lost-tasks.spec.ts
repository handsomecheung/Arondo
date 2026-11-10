import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import { createSession, addMessage, appendSessionLog, deleteSession, getMessages, getSession } from '../../lib/store';
import { runnerManager, type TaskContext } from '../../lib/runner-manager';

const runnerId = 'runner-lost-test-runner';

function withJevMock(choice: string, onRequest: (request: any) => void) {
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalUrl = process.env.TYPESAFE_API_URL;
  const originalFetch = global.fetch;
  process.env.TYPESAFE_API_KEY = 'test-jev-key';
  process.env.TYPESAFE_API_URL = 'https://jev.test/systemone';
  global.fetch = (async (_url, init) => {
    onRequest(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      answers: { failure_kind: { choice, confidence: 0.9 } },
    }), { status: 200 });
  }) as typeof fetch;
  return () => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.TYPESAFE_API_URL;
    else process.env.TYPESAFE_API_URL = originalUrl;
  };
}

async function createAgentTask(sessionId: string, taskId: string) {
  const run = await addMessage({ sessionId, role: 'system', type: 'agent-run', content: 'codex exec', resolvedAgentType: 'codex', taskId });
  const ctx: TaskContext = {
    taskId,
    runnerId,
    sessionId,
    messageId: run.id,
    type: 'agent',
    createdAt: Date.now(),
    command: 'codex exec',
    prompt: 'explain the reading',
  };
  (runnerManager as any).tasks.set(taskId, ctx);
  return { run, ctx };
}

test.describe('runner lost tasks', () => {
  test('keeps a task open when its runner disconnects', async () => {
    const session = await createSession({ status: 'running', repoPath: '/unused', runnerId, agentType: 'codex' }, { automation: true });
    const taskId = 'runner-lost-disconnect-test';
    try {
      const { ctx } = await createAgentTask(session.id, taskId);
      (runnerManager as any).runners.set(runnerId, { id: runnerId, ws: {}, info: { id: runnerId, name: 'test' } });

      (runnerManager as any).removeRunner(runnerId);

      expect(ctx.completedAt).toBeUndefined();
      expect(ctx.logsMayBeIncomplete).toBe(true);
      const messages = await getMessages(session.id);
      expect(messages.some((m) => m.type === 'agent-return')).toBe(false);
    } finally {
      (runnerManager as any).tasks.delete(taskId);
      await fs.rm((runnerManager as any).runnerFilePath(runnerId), { force: true });
      await deleteSession(session.id);
    }
  });

  test('records a lost task without an exit code and tells Jev the code is synthetic', async () => {
    const session = await createSession({ status: 'running', repoPath: '/unused', runnerId, agentType: 'codex' }, { automation: true });
    const taskId = 'runner-lost-record-test';
    let request: any;
    const restoreJev = withJevMock('agent_error', (body) => { request = body; });
    try {
      const { run, ctx } = await createAgentTask(session.id, taskId);
      await appendSessionLog(session.id, run.id, 'agent', 'partial output', true, undefined, 'stdout');
      ctx.logsMayBeIncomplete = true;

      await (runnerManager as any).onExecExit({ taskId, exitCode: -1, runnerLost: true });

      const state = JSON.parse(request.state);
      expect(state.exitCode).toBe(-1);
      expect(state.exitCodeSynthetic).toBe(true);
      expect(state.logsMayBeIncomplete).toBe(true);

      const messages = await getMessages(session.id);
      const returnMsg = messages.find((m) => m.type === 'agent-return');
      expect(returnMsg?.runnerLost).toBe(true);
      expect(returnMsg?.rawExitCode).toBeUndefined();
      expect(returnMsg?.content).toContain('runner lost track');
      expect(messages.find((m) => m.id === run.id)?.exitCode).toBeUndefined();
      expect((await getSession(session.id))?.status).toBe('error');
    } finally {
      restoreJev();
      (runnerManager as any).tasks.delete(taskId);
      await deleteSession(session.id);
    }
  });

  test('corrects a runner lost task when the runner later reports the real exit', async () => {
    const session = await createSession({ status: 'running', repoPath: '/unused', runnerId, agentType: 'codex' }, { automation: true });
    const taskId = 'runner-lost-correction-test';
    const restoreJev = withJevMock('agent_error', () => {});
    try {
      const { run } = await createAgentTask(session.id, taskId);
      await appendSessionLog(session.id, run.id, 'agent', 'The final answer.', true, undefined, 'stdout');
      await (runnerManager as any).onExecExit({ taskId, exitCode: -1, runnerLost: true });
      const beforeCorrection = (await getMessages(session.id)).filter((m) => m.type === 'agent-return');
      expect(beforeCorrection).toHaveLength(1);

      await (runnerManager as any).onExecExit({ taskId, exitCode: 0 });

      const returns = (await getMessages(session.id)).filter((m) => m.type === 'agent-return');
      expect(returns).toHaveLength(1);
      expect(returns[0].id).toBe(beforeCorrection[0].id);
      expect(returns[0].content).toBe('✅ Done!');
      expect(returns[0].role).toBe('agent');
      expect(returns[0].rawExitCode).toBe(0);
      expect(returns[0].statusOverride).toBe(true);
      expect(returns[0].runnerLost).toBe(false);
      expect(returns[0].overrideReason).toContain('real exit');
      expect((await getSession(session.id))?.status).toBe('done');
    } finally {
      restoreJev();
      (runnerManager as any).tasks.delete(taskId);
      await deleteSession(session.id);
    }
  });
});
