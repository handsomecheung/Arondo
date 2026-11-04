import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { getDefaultAgentModels } from '../../lib/agentModels';
import { getModelOptionsForAgent, isAgentQuotaExhausted, isQuotaAvailable, selectAgent } from '../../lib/autoagent';
import { resolveAgentType } from '../../lib/agents';
import { createSession, addMessage, updateSession, deleteSession, getPendingTodoMessages } from '../../lib/store';
import { processQuotaErrorRetries } from '../../lib/heartbeat';
import { getAgentQuotaErrorMessage } from '../../lib/agent-quota-errors';

const quotaPath = path.join(process.env.ARONDO_CONFIG_DIR!, 'autoagent', 'agent', 'quota.json');
const available = {
  Type: 'opencode', Account: 'org_test', Plan: 'Go',
  FiveHourRemain: 0.8, WeeklyRemain: 0.7, MonthlyRemain: 0.6,
  WeeklyResetAt: Math.floor(Date.now() / 1000) + 6 * 86400,
};
async function writeQuota(quota: object) {
  await fs.mkdir(path.dirname(quotaPath), { recursive: true });
  await fs.writeFile(quotaPath, JSON.stringify(quota));
}
test.afterEach(async () => { await fs.rm(quotaPath, { force: true }); });

for (const plan of ['Go', 'Go Plus', 'Go Teams']) {
  test(`selects OpenCode ${plan} with remaining subscription quota`, async () => {
    await writeQuota({ entry: { ...available, Plan: plan } });
    await expect(selectAgent(['opencode'])).resolves.toMatchObject({ agentType: 'opencode', model: 'opencode-go/minimax-m3' });
    await expect(isQuotaAvailable('opencode')).resolves.toBe(true);
    await expect(isAgentQuotaExhausted('opencode')).resolves.toBe(false);
    await expect(selectAgent(['claude'])).resolves.toMatchObject({ agentType: 'claude' });
  });
}

test('excludes API billing, unknown plans, absent quota, and incomplete windows from every fallback', async () => {
  for (const entry of [
    { ...available, IsAPIKey: true },
    { ...available, Plan: 'API' },
    { ...available, Plan: '' },
    { ...available, FiveHourRemain: null },
    { ...available, WeeklyRemain: null },
    { ...available, MonthlyRemain: null },
    { ...available, MonthlyRemain: 'unknown' },
    undefined,
  ]) {
    await writeQuota(entry ? { entry } : {});
    await expect(selectAgent(['opencode'])).resolves.toBeNull();
    await expect(isQuotaAvailable('opencode')).resolves.toBe(false);
    await expect(isAgentQuotaExhausted('opencode')).resolves.toBe(true);
    await expect(resolveAgentType('auto', ['opencode'], {
      lockedAgent: { agentType: 'opencode', model: 'opencode-go/minimax-m3' },
    })).resolves.toBeNull();
    await expect(selectAgent(['opencode', 'claude'])).resolves.toMatchObject({ agentType: 'claude' });
  }
});

test('excludes a signed-in free account without a Go subscription from every fallback', async () => {
  await writeQuota({ entry: { Type: 'opencode', Account: 'org_free', Plan: 'Free' } });
  await expect(selectAgent(['opencode'])).resolves.toBeNull();
  await expect(isQuotaAvailable('opencode')).resolves.toBe(false);
  await expect(isAgentQuotaExhausted('opencode')).resolves.toBe(true);
  await expect(resolveAgentType('auto', ['opencode'], {
    lockedAgent: { agentType: 'opencode', model: 'opencode-go/minimax-m3' },
  })).resolves.toBeNull();
  await expect(selectAgent(['opencode', 'claude'])).resolves.toMatchObject({ agentType: 'claude' });
});

test('excludes an unauthenticated installation billed by API key from every fallback', async () => {
  await writeQuota({ entry: { Type: 'opencode', Account: 'unauthenticated', Plan: 'API Key', IsAPIKey: true } });
  await expect(selectAgent(['opencode'])).resolves.toBeNull();
  await expect(isQuotaAvailable('opencode')).resolves.toBe(false);
  await expect(isAgentQuotaExhausted('opencode')).resolves.toBe(true);
  await expect(resolveAgentType('auto', ['opencode'], {
    lockedAgent: { agentType: 'opencode', model: 'opencode-go/minimax-m3' },
  })).resolves.toBeNull();
  await expect(selectAgent(['opencode', 'claude'])).resolves.toMatchObject({ agentType: 'claude' });
});

for (const metric of ['FiveHourRemain', 'WeeklyRemain', 'MonthlyRemain']) {
  test(`applies exhaustion and retry thresholds to OpenCode ${metric}`, async () => {
    for (const remain of [0, 0.019, 0.02, 1 - 0.98, 0.020001, 0.14, 0.15]) {
      await writeQuota({ entry: { ...available, [metric]: remain } });
      const exhausted = remain <= 0.02 + Number.EPSILON;
      expect((await selectAgent(['opencode']))?.agentType ?? null).toBe(exhausted ? null : 'opencode');
      await expect(isAgentQuotaExhausted('opencode')).resolves.toBe(exhausted);
      await expect(isQuotaAvailable('opencode')).resolves.toBe(!exhausted && (metric !== 'FiveHourRemain' || remain >= 0.15));
    }
  });
}

test('ranks OpenCode by weekly quota and deprioritizes a low 5-hour window', async () => {
  const codex = { Type: 'codex', FiveHourRemain: 1, WeeklyRemain: 0.5, WeeklyResetAt: available.WeeklyResetAt };
  await writeQuota({ entry: available, codex });
  await expect(selectAgent(['opencode', 'codex'])).resolves.toMatchObject({ agentType: 'opencode' });
  await writeQuota({ entry: { ...available, WeeklyRemain: 0.4 }, codex });
  await expect(selectAgent(['opencode', 'codex'])).resolves.toMatchObject({ agentType: 'codex' });
  await writeQuota({ entry: { ...available, FiveHourRemain: 0.1 }, codex });
  await expect(selectAgent(['opencode', 'codex'])).resolves.toMatchObject({ agentType: 'codex' });
  await expect(selectAgent(['opencode'])).resolves.toMatchObject({ agentType: 'opencode' });
});

test('uses the execution runner subscription rather than another runner quota', async () => {
  await writeQuota({
    opencode_org_test_Go: { ...available, updatedAt: 1 },
    opencode_org_other_Go: { ...available, Account: 'org_other', MonthlyRemain: 0, updatedAt: 2 },
  });
  const ref = { Account: 'org_test', Plan: 'Go' };
  await expect(selectAgent(['opencode'], undefined, undefined, ref)).resolves.toMatchObject({ agentType: 'opencode' });
  await expect(selectAgent(['opencode'], undefined, undefined, null)).resolves.toBeNull();
  await expect(isQuotaAvailable('opencode', undefined, ref)).resolves.toBe(true);
  await expect(isQuotaAvailable('opencode', undefined, null)).resolves.toBe(false);
  await expect(resolveAgentType('auto', ['opencode'], {
    opencodeQuotaRef: null, lockedAgent: { agentType: 'opencode', model: 'opencode-go/minimax-m3' },
  })).resolves.toBeNull();
});

test('releases invalid or exhausted OpenCode locks and preserves eligible locks', async () => {
  const codex = { Type: 'codex', FiveHourRemain: 1, WeeklyRemain: 0.9 };
  await writeQuota({ entry: { ...available, MonthlyRemain: 0 }, codex });
  const lockedAgent = { agentType: 'opencode' as const, model: 'opencode-go/minimax-m3' };
  await expect(resolveAgentType('auto', ['opencode', 'codex'], { lockedAgent })).resolves.toMatchObject({ agentType: 'codex' });
  await writeQuota({ entry: available, codex });
  await expect(resolveAgentType('auto', ['opencode', 'codex'], { lockedAgent })).resolves.toMatchObject({ agentType: 'opencode' });
  await expect(resolveAgentType('auto', ['codex'], { lockedAgent })).resolves.toMatchObject({ agentType: 'codex' });
  await expect(resolveAgentType('auto', ['opencode'], {
    lockedAgent: { ...lockedAgent, model: 'opencode/minimax-m3' },
  })).resolves.toMatchObject({ agentType: 'opencode', model: 'opencode-go/minimax-m3' });
});

test('limits automodel options to Go models and preserves variants and descriptions', () => {
  const config = getDefaultAgentModels();
  config.opencode = { availableModels: [
    'opencode-go/gemini-4-argon#high # Multimodal reasoning',
    'opencode-go/minimax-m3 # Everyday coding',
    'opencode/minimax-m3 # Pay as you go',
    'anthropic/claude-opus-5-5', '# comment', '',
  ] };
  expect(getModelOptionsForAgent('opencode', undefined, config)).toEqual([
    expect.objectContaining({ model: 'opencode-go/gemini-4-argon#high', description: 'Multimodal reasoning' }),
    expect.objectContaining({ model: 'opencode-go/minimax-m3', description: 'Everyday coding' }),
  ]);
});

test('schedules OpenCode quota retry after the last blocking window resets', async () => {
  const session = await createSession({ agentType: 'auto', repoPath: '/tmp/opencode-auto', runnerId: 'test-open-auto', status: 'idle' });
  try {
    await addMessage({ sessionId: session.id, role: 'user', content: 'Continue coding' });
    await addMessage({ sessionId: session.id, role: 'system', type: 'agent-run', resolvedAgentType: 'opencode', content: 'Running' });
    await addMessage({ sessionId: session.id, role: 'system', type: 'agent-return', content: `⚠️ ${getAgentQuotaErrorMessage('opencode')}` });
    await updateSession(session.id, { status: 'error', errorMessage: getAgentQuotaErrorMessage('opencode') });
    const now = Math.floor(Date.now() / 1000);
    await writeQuota({ entry: { ...available, FiveHourRemain: 0, FiveHourResetAt: now + 3600, MonthlyRemain: 0, MonthlyResetAt: now + 86400, updatedAt: now } });
    await processQuotaErrorRetries();
    const todos = await getPendingTodoMessages(session.id);
    expect(todos).toHaveLength(1);
    expect(todos[0].todoTrigger).toMatchObject({ kind: 'at', timestamp: (now + 86400 + 300) * 1000 });
  } finally {
    await deleteSession(session.id);
  }
});
