import { test, expect } from '@playwright/test';
import http from 'node:http';
import { getEffortOptions, getModelFamily } from '../../lib/llm/automodel/effort-options';
import { getModelOptionsForAgent } from '../../lib/autoagent';
import { getDefaultAgentModels } from '../../lib/agentModels';
import { getAgent, resolveAgentType } from '../../lib/agents';
import { routeModel } from '../../lib/llm/automodel';
import { addMessage, createSession, deleteSession, getMessages, appendSessionLog, updateAppSettings, getAppSettings } from '../../lib/store';
import { buildEffortContext } from '../../lib/llm/automodel/context';

const envNames = ['ARONDO_ENABLE_AUTOMODEL', 'ARONDO_INNER_AUTOMODEL_METHOD', 'TYPESAFE_API_KEY', 'JEV_API_KEY', 'TYPESAFE_API_URL', 'ANTHROPIC_API_KEY'] as const;
let savedEnv: Array<string | undefined>;
let server: http.Server;
let payloads: Array<{ state: string; questions: { choiceId: { criteria: Record<string, string> } } }>;
let selectedEffort: string;
let status: number;
let invalidChoice: boolean;
let delayMs: number;

test.beforeEach(async () => {
  savedEnv = envNames.map((name) => process.env[name]);
  payloads = [];
  selectedEffort = 'high';
  status = 200;
  invalidChoice = false;
  delayMs = 0;
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      payloads.push(payload);
      const choices = Object.keys(payload.questions.choiceId.criteria);
      const choice = invalidChoice ? 'another-model' : choices.find((id) => id.endsWith(`-${selectedEffort}`)) || choices[0];
      const respond = () => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answers: { choiceId: { choice }, taskClass: { choice: 'debug' }, costTier: { choice: 'strong' } } }));
      };
      if (delayMs) setTimeout(respond, delayMs);
      else respond();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.ARONDO_ENABLE_AUTOMODEL = 'true';
  process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'LLM';
  process.env.TYPESAFE_API_KEY = 'mock-effort-key';
  delete process.env.JEV_API_KEY;
  process.env.TYPESAFE_API_URL = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'must-not-be-used-for-effort';
});

test.afterEach(async () => {
  envNames.forEach((name, i) => {
    if (savedEnv[i] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[i];
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('routes each resumed Codex turn through Jev, preserving the model and using context', async () => {
  const first = await resolveAgentType('codex', ['codex'], {
    model: 'gpt-6-sol', prompt: 'Investigate this concurrency failure', once: false,
  });
  expect(first).toMatchObject({ model: 'gpt-6-sol', effort: 'high' });
  selectedEffort = 'low';
  const second = await resolveAgentType('codex', ['codex'], {
    model: 'gpt-6-sol', prompt: 'Explain the result', previousRun: first,
    context: 'The concurrency failure was fixed and verified.',
  });
  expect(second).toMatchObject({ model: 'gpt-6-sol', effort: 'low' });
  expect(payloads).toHaveLength(2);
  expect(payloads[1].state).toContain('Previous effort: high');
  expect(payloads[1].state).toContain('concurrency failure was fixed');
  expect(Object.values(payloads[1].questions.choiceId.criteria).every((text) => text.includes('gpt-6-sol'))).toBe(true);
  const command = getAgent('codex').getCommand({ ...second, prompt: 'Explain', repoPath: '/tmp', isResume: true });
  expect(command).toContain('--model "gpt-6-sol" -c model_reasoning_effort="low"');
});

test('Claude explicit once sessions preserve the chosen model and pass effort to the CLI', async () => {
  const result = await resolveAgentType('claude', ['claude'], { model: 'sonnet', prompt: 'Review the patch', once: true });
  expect(result).toMatchObject({ model: 'sonnet', effort: 'high' });
  expect(getAgent('claude').getCommand({ ...result, prompt: 'Review', repoPath: '/tmp', sessionId: 'test-id', isResume: true }))
    .toContain('--resume "test-id" --model "sonnet" --effort "high"');
});

test('ongoing Auto sessions preserve their locked model family while changing effort', async () => {
  const result = await resolveAgentType('auto', ['agy'], {
    lockedAgent: { agentType: 'antigravity', model: 'Claude Sonnet 5.5 (Medium)', agyQuotaGroup: 'other' },
    prompt: 'Debug this issue', once: false,
  });
  expect(result).toMatchObject({ agentType: 'antigravity', model: 'Claude Sonnet 5.5 (High)', agyQuotaGroup: 'other' });
  const criteria = Object.values(payloads[0].questions.choiceId.criteria);
  expect(criteria).toHaveLength(3);
  expect(criteria.every((text) => text.includes('Claude Sonnet 5.5'))).toBe(true);
  expect(getAgent('antigravity').getCommand({ ...result!, prompt: 'Debug', repoPath: '/tmp' }))
    .toContain('--model "Claude Sonnet 5.5 (High)"');
});

for (const failure of ['http-error', 'invalid-choice'] as const) {
  test(`keeps the previous effort on ${failure} without standard LLM fallback`, async () => {
    status = failure === 'http-error' ? 500 : 200;
    invalidChoice = failure === 'invalid-choice';
    const result = await resolveAgentType('codex', ['codex'], {
      model: 'gpt-6-sol', prompt: 'Continue',
      previousRun: { agentType: 'codex', model: 'gpt-6-sol', effort: 'xhigh' },
    });
    expect(result).toMatchObject({ model: 'gpt-6-sol', effort: 'xhigh' });
    expect(payloads).toHaveLength(1);
  });
}

test('keeps the previous agy variant when Jev fails', async () => {
  status = 500;
  const result = await resolveAgentType('antigravity', ['agy'], {
    model: 'Gemini 4 Argon (Medium)', prompt: 'Continue',
    previousRun: { agentType: 'antigravity', model: 'Gemini 4 Argon (Low)' },
  });
  expect(result.model).toBe('Gemini 4 Argon (Low)');
});

test('times out Jev and retains the previous effort', async () => {
  delayMs = 3200;
  const result = await resolveAgentType('claude', [], {
    model: 'sonnet', prompt: 'Continue',
    previousRun: { agentType: 'claude', model: 'sonnet', effort: 'medium' },
  });
  expect(result).toMatchObject({ model: 'sonnet', effort: 'medium' });
  expect(payloads).toHaveLength(1);
});

test('accepts a first-turn Jev decision taking longer than the old timeout', async () => {
  delayMs = 2000;
  const result = await resolveAgentType('codex', ['codex'], {
    model: 'gpt-6.1-sol', prompt: 'Implement a directory traversal function in C',
  });
  expect(result).toMatchObject({ model: 'gpt-6.1-sol', effort: 'high' });
  expect(payloads).toHaveLength(1);
});

test('changing the explicit model discards previous model effort', async () => {
  status = 500;
  const result = await resolveAgentType('codex', [], {
    model: 'gpt-6-astra', prompt: 'Continue',
    previousRun: { agentType: 'codex', model: 'gpt-6-sol', effort: 'max' },
  });
  expect(result.model).toBe('gpt-6-astra');
  expect(result.effort).toBeUndefined();
});

test('unknown models, single variants, disabled routing and missing Jev keep current settings', async () => {
  for (const [agent, model] of [['claude', 'claude-3-7-sonnet'], ['codex', 'custom-model'], ['antigravity', 'GPT-OSS 120B (Medium)']] as const) {
    const result = await resolveAgentType(agent, [], { model, prompt: 'Continue' });
    expect(result.model).toBe(model);
  }
  process.env.ARONDO_ENABLE_AUTOMODEL = 'false';
  expect((await resolveAgentType('codex', [], { model: 'gpt-6-sol', prompt: 'Continue' })).effort).toBeUndefined();
  process.env.ARONDO_ENABLE_AUTOMODEL = 'true';
  process.env.TYPESAFE_API_KEY = ' ';
  const result = await resolveAgentType('codex', [], { model: 'gpt-6-sol high', prompt: 'Continue' });
  expect(result).toMatchObject({ model: 'gpt-6-sol', effort: 'high' });
  expect(payloads).toHaveLength(0);
});

test('effort candidates respect model capabilities and configured OpenCode variants', async () => {
  expect(getEffortOptions('claude', 'claude-opus-4-6', []).map((option) => option.effort))
    .toEqual(['low', 'medium', 'high', 'max']);
  expect(getEffortOptions('claude', 'claude-haiku-4-5', [])).toEqual([]);
  expect(getEffortOptions('claude', 'claude-haiku-5', [])).toEqual([]);
  expect(getEffortOptions('codex', 'gpt-5.1-codex-mini', [])).toEqual([]);
  expect(getEffortOptions('codex', 'gpt-6.1-luna', [])).toEqual([]);
  expect(getEffortOptions('opencode', 'opencode-go/minimax-m3', []).map((option) => option.model))
    .toEqual(['opencode-go/minimax-m3#none', 'opencode-go/minimax-m3#thinking']);
  expect(getEffortOptions('opencode', 'opencode-go/claude-haiku-5-5', []).map((option) => option.model))
    .toEqual(['low', 'medium', 'high', 'xhigh', 'max'].map((effort) => `opencode-go/claude-haiku-5-5#${effort}`));
  expect(getEffortOptions('opencode', 'opencode/minimax-m3', [])).toEqual([]);
  expect(getEffortOptions('opencode', 'opencode-go/mimo-v2.6-pro', [])).toEqual([]);
  const config = getDefaultAgentModels();
  config.opencode = { availableModels: ['opencode-go/gemini-4-argon#low', 'opencode-go/gemini-4-argon#high', 'opencode-go/glm-5.3#high'] };
  const options = getEffortOptions('opencode', 'opencode-go/gemini-4-argon#low', getModelOptionsForAgent('opencode', undefined, config));
  expect(options.map((option) => option.model)).toEqual(['opencode-go/gemini-4-argon#low', 'opencode-go/gemini-4-argon#high']);
  expect(getModelFamily('opencode', options[0].model)).toBe('opencode-go/gemini-4-argon');
});

test('default OpenCode MiniMax selects thinking on each turn and preserves it on failure', async () => {
  selectedEffort = 'thinking';
  const first = await resolveAgentType('opencode', ['opencode'], { prompt: 'Investigate this bug' });
  expect(first.model).toBe('opencode-go/minimax-m3#thinking');
  const criteria = payloads[0].questions.choiceId.criteria;
  expect(Object.keys(criteria)).toHaveLength(2);
  expect(Object.values(criteria).join('\n')).toContain('thinking disabled');
  expect(Object.values(criteria).join('\n')).toContain('adaptive thinking enabled');
  expect(getAgent('opencode').getCommand({ ...first, prompt: 'Investigate', repoPath: '/tmp', sessionId: 'test' }))
    .toContain('--model "opencode-go/minimax-m3#thinking"');
  selectedEffort = 'none';
  const second = await resolveAgentType('opencode', ['opencode'], { prompt: 'Summarize', previousRun: first });
  expect(second.model).toBe('opencode-go/minimax-m3#none');
  status = 500;
  const fallback = await resolveAgentType('opencode', ['opencode'], { prompt: 'Continue', previousRun: second });
  expect(fallback.model).toBe('opencode-go/minimax-m3#none');
});

test('single-use OpenCode routing expands bare Go models into native variants', async () => {
  process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'DM';
  selectedEffort = 'thinking';
  const result = await routeModel({
    agentType: 'opencode', defaultModel: 'opencode-go/minimax-m3', message: 'Debug this issue', once: true,
    modelOptions: [{ id: 'minimax', model: 'opencode-go/minimax-m3', costTier: 'standard', description: 'MiniMax M3' }],
  });
  expect(result?.model).toBe('opencode-go/minimax-m3#thinking');
});

for (const once of [true, false]) {
  test(`Haiku routing excludes none from native and configured candidates (once=${once})`, async () => {
    process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'DM';
    selectedEffort = 'medium';
    const model = 'opencode-go/claude-haiku-5-5';
    for (const models of [[model], [`${model}#none`, `${model}#low`, `${model}#medium`]]) {
      const result = await routeModel({
        agentType: 'opencode', defaultModel: model, message: 'Write a directory traversal function in C', once,
        modelOptions: models.map((model, i) => ({ id: `haiku-${i}-${model.split('#')[1] || 'default'}`, model, costTier: 'standard', description: model })),
      });
      expect(result?.model).toBe(`${model}#medium`);
      const criteria = Object.values(payloads.at(-1)!.questions.choiceId.criteria);
      expect(criteria.some((text) => text.includes('#none'))).toBe(false);
      expect(criteria.some((text) => text.includes('#low'))).toBe(true);
    }
  });
}

test('manual OpenCode routes configured non-Go variants and preserves the variant on failure', async () => {
  const before = await getAppSettings();
  try {
    const config = getDefaultAgentModels();
    config.opencode = { availableModels: ['custom/model#low', 'custom/model#high'] };
    await updateAppSettings({ agentModels: config });
    const result = await resolveAgentType('opencode', [], { model: 'custom/model#low', prompt: 'Review' });
    expect(result.model).toBe('custom/model#high');
    expect(getAgent('opencode').getCommand({ ...result, prompt: 'Review', repoPath: '/tmp' })).toContain('--model "custom/model#high"');
    status = 500;
    const fallback = await resolveAgentType('opencode', [], { model: 'custom/model#low', prompt: 'Continue', previousRun: result });
    expect(fallback.model).toBe('custom/model#high');
  } finally {
    await updateAppSettings({ agentModels: before.agentModels });
  }
});

test('once routing can still choose a different model', async () => {
  process.env.ARONDO_INNER_AUTOMODEL_METHOD = 'DM';
  const result = await routeModel({
    agentType: 'codex', defaultModel: 'gpt-6-sol', message: 'Review', once: true,
    modelOptions: [
      { id: 'sol-low', model: 'gpt-6-sol', effort: 'low', costTier: 'cheap', description: 'Fast' },
      { id: 'astra-high', model: 'gpt-6-astra', effort: 'high', costTier: 'strong', description: 'Strong' },
    ],
  });
  expect(result).toMatchObject({ model: 'gpt-6-astra', effort: 'high' });
});

test('effort context includes task history and excludes detached and deleted messages', async () => {
  const session = await createSession({ agentType: 'codex', repoPath: '/tmp/effort-context-test', runnerId: 'effort-test', status: 'idle' });
  try {
    await addMessage({ sessionId: session.id, role: 'user', type: 'chat-user', content: 'Investigate a deadlock' });
    const run = await addMessage({ sessionId: session.id, role: 'system', type: 'agent-run', content: 'command', resolvedEffort: 'high' });
    await appendSessionLog(session.id, run.id, 'agent', 'Lock ordering is inconsistent.');
    await addMessage({ sessionId: session.id, role: 'user', type: 'chat-user', content: 'deleted-secret', deleted: true });
    await addMessage({ sessionId: session.id, role: 'user', type: 'detached-agent-run', content: 'detached-secret' });
    const messages = await getMessages(session.id);
    const context = await buildEffortContext(session.id, messages);
    expect(context).toContain('Investigate a deadlock');
    expect(context).toContain('Lock ordering is inconsistent.');
    expect(context).not.toContain('secret');
    expect(messages.find((message) => message.id === run.id)?.resolvedEffort).toBe('high');
  } finally {
    await deleteSession(session.id);
  }
});
