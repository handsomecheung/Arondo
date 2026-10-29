import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { isQuotaAvailable, selectAgent } from '../../lib/autoagent';
import { resolveAgentType } from '../../lib/agents';
import { setupRunner, teardownRunner } from './resume/resume.helper';

const quotaPath = path.join(process.env.ARONDO_CONFIG_DIR!, 'autoagent', 'agent', 'quota.json');
const headers = { 'x-arondo-token': 'test-token-123456' };
const cases = [
  { Type: 'claude', binaries: ['claude'], hour: 'HourRemain', week: 'WeekRemain' },
  { Type: 'codex', binaries: ['codex'], hour: 'FiveHourRemain', week: 'WeeklyRemain' },
  { Type: 'antigravity', binaries: ['agy'], group: 'gemini', hour: 'GeminiHourRemain', week: 'GeminiWeeklyRemain' },
  { Type: 'antigravity', binaries: ['agy'], group: 'other', hour: 'OtherHourRemain', week: 'OtherWeeklyRemain' },
  { Type: 'antigravity', binaries: ['agy'], group: 'argon', week: 'ArgonWeeklyRemain' },
] as const;

async function writeQuota(quota: object) {
  await fs.mkdir(path.dirname(quotaPath), { recursive: true });
  await fs.writeFile(quotaPath, JSON.stringify(quota));
}

const exhausted = {
  claude: { Type: 'claude', HourRemain: 1, WeekRemain: 0.02 },
  codex: { Type: 'codex', FiveHourRemain: 0.02, WeeklyRemain: 1 },
  agy: { Type: 'antigravity', GeminiWeeklyRemain: 0, OtherWeeklyRemain: 0.02, ArgonWeeklyRemain: 0.01 },
};

test.afterEach(async () => {
  await fs.rm(quotaPath, { force: true });
});

for (const entry of cases) {
  for (const window of ['hour', 'week'] as const) {
    const metric = window === 'hour' ? ('hour' in entry ? entry.hour : undefined) : entry.week;
    if (!metric) continue;
    test(`${entry.Type} ${'group' in entry ? entry.group : ''} ${window}: excludes quota at or below 2%`, async () => {
      for (const { remain, exhausted } of [
        { remain: 0, exhausted: true },
        { remain: 0.019, exhausted: true },
        { remain: 0.02, exhausted: true },
        { remain: 1 - 0.98, exhausted: true },
        { remain: 0.020001, exhausted: false },
        { remain: null, exhausted: false },
      ]) {
        await writeQuota({ entry: {
          Type: entry.Type,
          GeminiWeeklyRemain: 0, OtherWeeklyRemain: 0, ArgonWeeklyRemain: 0,
          [entry.week]: 0.9,
          ...('hour' in entry ? { [entry.hour]: 1 } : {}),
          [metric]: remain,
        } });
        const selected = await selectAgent([...entry.binaries]);
        if (exhausted) {
          expect(selected).toBeNull();
        } else {
          expect(selected?.agentType).toBe(entry.Type);
          if ('group' in entry) expect(selected?.agyQuotaGroup).toBe(entry.group);
        }
        const available = !exhausted && (window !== 'hour' || remain === null || remain >= 0.15);
        await expect(isQuotaAvailable(entry.Type, 'group' in entry ? entry.group : undefined)).resolves.toBe(available);
      }
    });
  }
}

test('excludes the exhausted Gemini group from the production scoring scenario', async () => {
  const now = Math.floor(Date.now() / 1000);
  await writeQuota({
    agy: {
      Type: 'antigravity', GeminiWeeklyRemain: 0, GeminiHourRemain: null,
      GeminiWeeklyResetsAt: now + 14470,
      OtherWeeklyRemain: 0.1993, OtherHourRemain: 1, OtherWeeklyResetsAt: now + 211570,
      ArgonWeeklyRemain: 0.3363, ArgonWeeklyResetsAt: now + 227710,
    },
    codex: { Type: 'codex', FiveHourRemain: 1, WeeklyRemain: 0.87, WeeklyResetAt: now + 543680 },
  });
  const logs: string[] = [];
  await expect(selectAgent(['agy', 'codex'], (text) => { logs.push(text); })).resolves.toMatchObject({ agentType: 'codex' });
  expect(logs.join('')).toContain('Excluded exhausted choice A');
  expect(logs.join('')).toContain('Final Candidate Order: [D, E, B]');
});

test('falls back to unknown quota and then API billing without reusing exhausted choices', async () => {
  await writeQuota({ ...exhausted, codex: { Type: 'codex' } });
  await expect(selectAgent(['agy', 'claude', 'codex'])).resolves.toMatchObject({ agentType: 'codex' });
  await writeQuota({ ...exhausted, claude: { Type: 'claude', IsAPIKey: true } });
  await expect(selectAgent(['agy', 'claude', 'codex'])).resolves.toMatchObject({ agentType: 'claude' });
  await writeQuota({ codex: { Type: 'codex', FiveHourRemain: 0.02, WeeklyRemain: null } });
  await expect(selectAgent(['codex'])).resolves.toBeNull();
});

test('keeps non-exhausted choices when all hourly quotas are below 15%', async () => {
  await writeQuota({
    claude: { Type: 'claude', HourRemain: 0.1, WeekRemain: 0.8 },
    codex: { Type: 'codex', FiveHourRemain: 0.02, WeeklyRemain: 1 },
  });
  await expect(selectAgent(['claude', 'codex'])).resolves.toMatchObject({ agentType: 'claude' });
});

test('returns no agent when all quotas are exhausted, including locked choices', async () => {
  await writeQuota(exhausted);
  await expect(selectAgent(['agy', 'claude', 'codex'])).resolves.toBeNull();
  await expect(resolveAgentType('auto', ['agy', 'claude', 'codex'], {
    lockedAgent: { agentType: 'antigravity', agyQuotaGroup: 'gemini' },
  })).resolves.toBeNull();
  await expect(isQuotaAvailable()).resolves.toBe(false);
});

test('releases an exhausted agy group lock and logs the replacement', async () => {
  await writeQuota({ agy: {
    Type: 'antigravity', GeminiWeeklyRemain: 0.8, OtherWeeklyRemain: 0.02, ArgonWeeklyRemain: 0,
  } });
  const logs: string[] = [];
  await expect(resolveAgentType('auto', ['agy'], {
    lockedAgent: { agentType: 'antigravity', agyQuotaGroup: 'other', model: 'Claude Sonnet 4.6 (Thinking)' },
    autoagentLog: (text) => { logs.push(text); },
  })).resolves.toMatchObject({ agentType: 'antigravity', agyQuotaGroup: 'gemini' });
  expect(logs.join('')).toContain('"lockedAgentExhausted": true');
  expect(logs.join('')).toContain('"source": "quota"');
});

test('quota recovery uses the latest record rather than older available quota', async () => {
  await writeQuota({
    old: { Type: 'codex', FiveHourRemain: 1, WeeklyRemain: 1, updatedAt: 1 },
    latest: { Type: 'codex', FiveHourRemain: 1, WeeklyRemain: 0.02, updatedAt: 2 },
  });
  await expect(isQuotaAvailable('codex')).resolves.toBe(false);
});

test('rejects exhausted Auto runs and retains queued messages until quota recovers', async ({ request }) => {
  const runner = await setupRunner(request, `quota-exhaustion-${crypto.randomUUID()}`, path.resolve(__dirname, '../mocks/bin/claude'));
  let sessionId: string | undefined;
  try {
    await writeQuota(exhausted);
    const create = await request.post('/api/sessions', { headers, data: {
      prompt: 'Do not start with exhausted quota', agentType: 'auto', runnerId: runner.runnerId, noProject: true,
    } });
    expect(create.status()).toBe(503);

    const draft = await request.post('/api/sessions', { headers, data: {
      prompt: 'Wait for quota', agentType: 'auto', runnerId: runner.runnerId, noProject: true,
      isDraft: true, draftTrigger: 'manual',
    } });
    expect(draft.status()).toBe(201);
    sessionId = (await draft.json()).id;
    const followup = await request.post(`/api/sessions/${sessionId}/messages`, { headers, data: { message: 'Do not start', force: true } });
    expect(followup.status()).toBe(503);
    const detached = await request.post(`/api/sessions/${sessionId}/detached-agent-runs`, { headers, data: { kind: 'btw', message: 'Do not start', agentType: 'auto' } });
    expect(detached.status()).toBe(503);

    const before = await request.get(`/api/messages?sessionId=${sessionId}`, { headers });
    const pending = await before.json();
    expect(pending).toHaveLength(1);
    const todoId = pending[0].id;
    const send = () => request.patch(`/api/sessions/${sessionId}/todo-messages/${todoId}`, { headers, data: { action: 'sendNow' } });
    expect((await send()).status()).toBe(200);
    const waiting = await request.get(`/api/messages?sessionId=${sessionId}`, { headers });
    expect(await waiting.json()).toEqual([expect.objectContaining({ id: todoId, todoStatus: 'pending' })]);

    await writeQuota({ ...exhausted, claude: { Type: 'claude', HourRemain: 1, WeekRemain: 0.8 } });
    expect((await send()).status()).toBe(200);
    const resumed = await request.get(`/api/messages?sessionId=${sessionId}`, { headers });
    const messages = await resumed.json();
    expect(messages.find((message: any) => message.id === todoId).todoStatus).toBe('done');
    expect(messages.filter((message: any) => message.type === 'agent-run')).toHaveLength(1);
    expect(messages.find((message: any) => message.type === 'agent-run').resolvedAgentType).toBe('claude');
  } finally {
    await teardownRunner(runner.runnerProcess);
    if (sessionId) await request.delete(`/api/sessions/${sessionId}`, { headers });
  }
});
