import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { setupRunner, teardownRunner } from './resume/resume.helper';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { getOpencodeModelGroups, parseOpencodeModelLine, parseOpencodeModelList } from '../../lib/agentModels';
import { OpencodeAgent } from '../../lib/agents/opencode';
import { resolveAgentType } from '../../lib/agents';
import { getQuotaRows } from '../../lib/agent-quota-display';

const headers = { 'x-arondo-token': 'test-token-123456' };

test('OpenCode preserves variants and strips whitespace-delimited comments', () => {
  expect(parseOpencodeModelLine('opencode-go/gemini-4-argon#high # notes')).toBe('opencode-go/gemini-4-argon#high');
  expect(parseOpencodeModelList(['# note', '', 'opencode-go/glm-5.3 # coding'])).toEqual(['opencode-go/glm-5.3']);
});

test('OpenCode groups recognize legacy free models, preserve variants, and avoid duplicates', () => {
  const groups = getOpencodeModelGroups({ availableModels: [
    'opencode-go/glm-5.3 # paid',
    'opencode-go/beam-free#high # free variant',
    'opencode/big-pickle # free without suffix',
    'opencode/beam-free',
  ] });
  expect(parseOpencodeModelList(groups[0].models)).toEqual(['opencode-go/glm-5.3']);
  const free = parseOpencodeModelList(groups[1].models);
  expect(free).toContain('opencode-go/beam-free#high');
  expect(free.filter((m) => m === 'opencode/big-pickle')).toHaveLength(1);
  expect(free.filter((m) => m === 'opencode/beam-free')).toHaveLength(1);
  expect(getOpencodeModelGroups({ availableModels: [], freeModels: [] }).every((g) => !g.models.length)).toBe(true);
});

test('OpenCode settings validate, persist, and resolve default and explicit models', async ({ request }) => {
  const before = await (await request.get('/api/settings', { headers })).json();
  try {
    const invalid = await request.post('/api/settings', { headers, data: { agentModels: { opencode: { availableModels: [1] } } } });
    expect(invalid.status()).toBe(400);
    expect((await request.post('/api/settings', { headers, data: { agentModels: { opencode: { freeModels: [1] } } } })).status()).toBe(400);
    const forbidden = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-user-token-7890' },
      data: { agentModels: { opencode: { defaultModel: 'opencode-go/glm-5.3' } } },
    });
    expect(forbidden.status()).toBe(403);
    const save = await request.post('/api/settings', { headers, data: { agentModels: { opencode: {
      defaultModel: 'opencode-go/gemini-4-argon#high # default',
      availableModels: ['opencode-go/gemini-4-argon#high', 'opencode-go/glm-5.3'],
      freeModels: ['opencode/big-pickle', 'opencode-go/beam-free#high # notes'],
    } } } });
    expect(save.ok()).toBeTruthy();
    const settings = await (await request.get('/api/settings', { headers })).json();
    expect(settings.agentModels.opencode.availableModels).toContain('opencode-go/gemini-4-argon#high');
    expect(settings.agentModels.opencode.freeModels).toEqual(['opencode/big-pickle', 'opencode-go/beam-free#high # notes']);
    expect(settings.agentModels.claude).toEqual(before.agentModels.claude);
    const resolved = await resolveAgentType('opencode', ['opencode']);
    expect(resolved.model).toBe('opencode-go/gemini-4-argon#high');
    expect((await resolveAgentType('opencode', ['opencode'], { model: 'opencode-go/glm-5.3' })).model).toBe('opencode-go/glm-5.3');
    const command = new OpencodeAgent().getCommand({ prompt: 'test', repoPath: '/tmp', model: resolved.model });
    expect(command).toContain('--model "opencode-go/gemini-4-argon#high"');
    const clear = await request.post('/api/settings', { headers, data: { agentModels: { opencode: { defaultModel: '' } } } });
    expect(clear.ok()).toBeTruthy();
    expect((await resolveAgentType('opencode', ['opencode'])).model).toBeUndefined();
    expect(new OpencodeAgent().getCommand({ prompt: 'test', repoPath: '/tmp' })).not.toContain('--model');
  } finally {
    await request.post('/api/settings', { headers, data: { agentModels: before.agentModels } });
  }
});

test('OpenCode quota includes the monthly window and preserves unknown values', () => {
  expect(getQuotaRows({ FiveHourRemain: 0, WeeklyRemain: 0.7, MonthlyRemain: 0.6, MonthlyResetAt: 123 }, 'opencode', '')).toEqual([
    { label: 'hour', remaining: 0, resetsAt: null },
    { label: 'week', remaining: 0.7, resetsAt: null },
    { label: 'month', remaining: 0.6, resetsAt: 123 },
  ]);
  expect(getQuotaRows({}, 'opencode', '')).toEqual([]);
});


test('Runner fetches OpenCode Go quota and serves all windows through the quota API', async ({ request }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-opencode-'));
  const fixture = { data: { workspace: { id: 'org_opencode_test' }, go: {
    rolling: { percent: 20, limited: false, resetsAt: 1793778908000 },
    weekly: { percent: 30, limited: false, resetsAt: 1794182400000 },
    monthly: { percent: 40, limited: false, resetsAt: 1796292553000 },
  } } };
  const integrations = { data: [{ id: 'opencode', connections: [{ type: 'credential', id: 'cred_test', label: 'Personal', method: 'oauth' }] }] };
  const runner = await setupOpencodeRunner(request, 'OpenCode quota runner', directory, fixture, integrations);
  try {
    const refresh = await request.post('/api/agents/quota', { headers, data: { runnerId: runner.runnerId, agent: 'opencode' } });
    expect(refresh.ok()).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/agents/info?runnerId=${runner.runnerId}`, { headers });
      return (await response.json()).opencode;
    }).toMatchObject({
      Type: 'opencode', Account: 'org_opencode_test', Plan: 'Go',
      FiveHourRemain: 0.8, WeeklyRemain: 0.7, MonthlyRemain: 0.6,
      FiveHourResetAt: 1793778908, WeeklyResetAt: 1794182400, MonthlyResetAt: 1796292553,
    });
    const draft = await request.post('/api/sessions', { headers, data: {
      prompt: 'Choose a free model', agentType: 'claude', runnerId: runner.runnerId, noProject: true, isDraft: true, draftTrigger: 'manual', model: 'opus',
    } });
    expect(draft.status()).toBe(201);
    const draftSession = await draft.json();
    try {
      const switched = await request.patch(`/api/sessions/${draftSession.id}`, { headers, data: { agentType: 'opencode', model: 'opencode/big-pickle' } });
      expect(switched.ok()).toBeTruthy();
      expect(await switched.json()).toMatchObject({ agentType: 'opencode', model: 'opencode/big-pickle' });
      const sent = await request.post(`/api/sessions/${draftSession.id}/messages`, { headers, data: { message: 'Run the free model', force: true } });
      expect(sent.ok()).toBeTruthy();
      const messages = await (await request.get(`/api/messages?sessionId=${draftSession.id}`, { headers })).json();
      expect(messages).toContainEqual(expect.objectContaining({ type: 'agent-run', resolvedModel: 'opencode/big-pickle', content: expect.stringContaining('--model "opencode/big-pickle"') }));
      const cleared = await request.patch(`/api/sessions/${draftSession.id}`, { headers, data: { agentType: 'claude' } });
      expect((await cleared.json()).model).toBeUndefined();
    } finally {
      await request.delete(`/api/sessions/${draftSession.id}`, { headers });
    }
    const create = await request.post('/api/sessions', { headers, data: {
      prompt: 'Use OpenCode Go automatically', agentType: 'auto', runnerId: runner.runnerId, noProject: true,
    } });
    expect(create.status()).toBe(201);
    const session = await create.json();
    try {
      const response = await request.get(`/api/messages?sessionId=${session.id}`, { headers });
      expect(await response.json()).toContainEqual(expect.objectContaining({
        type: 'agent-run', resolvedAgentType: 'opencode', resolvedModel: 'opencode-go/minimax-m3',
      }));
    } finally {
      await request.delete(`/api/sessions/${session.id}`, { headers });
    }
  } finally {
    await teardownRunner(runner.runnerProcess);
    await request.delete(`/api/runners?id=${runner.runnerId}`, { headers });
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function setupOpencodeRunner(
  request: APIRequestContext,
  name: string,
  directory: string,
  limits: unknown,
  connections: unknown,
) {
  await fs.writeFile(path.join(directory, 'opencode'), `#!/usr/bin/env bash
if [[ "$1" == "api" && "$2" == "GET" && "$3" == "/api/experimental/usage/limits" ]]; then
  printf '%s' '${JSON.stringify(limits)}'
elif [[ "$1" == "api" && "$2" == "GET" && "$3" == "/api/integration" ]]; then
  printf '%s' '${JSON.stringify(connections)}'
else
  printf '%s' 'opencode v2.2.5'
fi
`, { mode: 0o755 });
  return setupRunner(request, name, directory);
}

test('Runner reports a signed-in account without a Go subscription as a free user', async ({ request }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-opencode-free-'));
  const runner = await setupOpencodeRunner(
    request,
    'OpenCode free runner',
    directory,
    { data: { workspace: { id: 'org_opencode_free' }, budgets: [] } },
    { data: [{ id: 'opencode', connections: [{ type: 'credential', id: 'cred_test', label: 'Personal', method: 'oauth' }] }] },
  );
  try {
    const refresh = await request.post('/api/agents/quota', { headers, data: { runnerId: runner.runnerId, agent: 'opencode' } });
    expect(refresh.ok()).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/agents/info?runnerId=${runner.runnerId}`, { headers });
      return (await response.json()).opencode;
    }).toMatchObject({
      Type: 'opencode', Account: 'org_opencode_free', Plan: 'Free', IsAPIKey: false,
    });
  } finally {
    await teardownRunner(runner.runnerProcess);
    await request.delete(`/api/runners?id=${runner.runnerId}`, { headers });
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Runner reports an installation without a Console account as API-key billed', async ({ request }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-opencode-apikey-'));
  const runner = await setupOpencodeRunner(
    request,
    'OpenCode API key runner',
    directory,
    { data: { budgets: [] } },
    { data: [{ id: 'opencode', connections: [] }] },
  );
  try {
    const refresh = await request.post('/api/agents/quota', { headers, data: { runnerId: runner.runnerId, agent: 'opencode' } });
    expect(refresh.ok()).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/agents/info?runnerId=${runner.runnerId}`, { headers });
      return (await response.json()).opencode;
    }).toMatchObject({
      Type: 'opencode', Account: 'unauthenticated', Plan: 'API Key', IsAPIKey: true,
    });
  } finally {
    await teardownRunner(runner.runnerProcess);
    await request.delete(`/api/runners?id=${runner.runnerId}`, { headers });
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Runner reports OpenCode when the usage response carries no data', async ({ request }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-opencode-nodata-'));
  const runner = await setupOpencodeRunner(
    request,
    'OpenCode no data runner',
    directory,
    { data: null },
    { data: [{ id: 'opencode', connections: [] }] },
  );
  try {
    const refresh = await request.post('/api/agents/quota', { headers, data: { runnerId: runner.runnerId, agent: 'opencode' } });
    expect(refresh.ok()).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/agents/info?runnerId=${runner.runnerId}`, { headers });
      return (await response.json()).opencode;
    }).toMatchObject({
      Type: 'opencode', Account: 'unauthenticated', Plan: 'API Key', IsAPIKey: true,
    });
  } finally {
    await teardownRunner(runner.runnerProcess);
    await request.delete(`/api/runners?id=${runner.runnerId}`, { headers });
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Runner reports OpenCode as a free user when the usage response carries no data for a signed-in account', async ({ request }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-opencode-nodata-oauth-'));
  const runner = await setupOpencodeRunner(
    request,
    'OpenCode no data OAuth runner',
    directory,
    { data: null },
    { data: [{ id: 'opencode', connections: [{ type: 'credential', id: 'cred_test', label: 'Personal', method: 'oauth' }] }] },
  );
  try {
    const refresh = await request.post('/api/agents/quota', { headers, data: { runnerId: runner.runnerId, agent: 'opencode' } });
    expect(refresh.ok()).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/agents/info?runnerId=${runner.runnerId}`, { headers });
      return (await response.json()).opencode;
    }).toMatchObject({
      Type: 'opencode', Account: 'unauthenticated', Plan: 'Free', IsAPIKey: false,
    });
  } finally {
    await teardownRunner(runner.runnerProcess);
    await request.delete(`/api/runners?id=${runner.runnerId}`, { headers });
    await fs.rm(directory, { recursive: true, force: true });
  }
});
