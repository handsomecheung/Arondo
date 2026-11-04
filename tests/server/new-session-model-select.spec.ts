import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import { resolveAgentType } from '../../lib/agents';

test.describe('New Session Model Select UI & Logic', () => {
  test('SessionView renders Model dropdown with 3 groups for agy, correct models for claude/codex, includes OpenCode, and hides for auto', () => {
    const scriptPath = path.resolve(__dirname, '../helpers/renderModelSelectHelper.ts');
    const output = execFileSync('npx', ['tsx', scriptPath], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
    });

    const result = JSON.parse(output.trim());

    // 1. Antigravity CLI
    expect(result.agy.hasModelRow).toBe(true);
    expect(result.agy.hasTrigger).toBe(true);
    expect(result.agy.hasGeminiGroup).toBe(true);
    expect(result.agy.hasAnthropicGroup).toBe(true);
    expect(result.agy.hasArgonGroup).toBe(true);
    expect(result.agy.hasGeminiModel).toBe(true);
    expect(result.agy.hasClaudeModel).toBe(true);
    expect(result.agy.hasArgonModel).toBe(true);
    expect(result.agy.hasGptOssModel).toBe(true);
    expect(result.agy.hasInlineCommentExcluded).toBe(true);

    // 2. Claude Code
    expect(result.claude.hasModelRow).toBe(true);
    expect(result.claude.hasOpus).toBe(true);
    expect(result.claude.hasSonnet).toBe(true);
    expect(result.claude.hasHaiku).toBe(true);
    expect(result.claude.hasArgonGroupExcluded).toBe(true);

    // 3. Codex
    expect(result.codex.hasModelRow).toBe(true);
    expect(result.codex.hasTerra).toBe(true);
    expect(result.codex.hasSol).toBe(true);

    // 4. Auto & OpenCode
    expect(result.auto.hasModelRow).toBe(false);
    expect(result.opencode.hasModelRow).toBe(true);
  });

  test('colored quota bars appear in agent options and Antigravity model group headers', () => {
    const output = execFileSync('npx', ['tsx', path.resolve(__dirname, '../helpers/renderModelQuotaHelper.ts')], {
      cwd: path.resolve(__dirname, '../..'), encoding: 'utf-8',
    });
    const result = JSON.parse(output.trim());
    const option = (group: string[], model: string) => group.find((row) => row.includes(model));
    expect(result.agy.every((row: string) => !row.includes('%') && !row.includes('quota'))).toBe(true);
    expect(result.agyGroups).toHaveLength(3);
    expect(option(result.agyGroups, 'Gemini ')).toContain('hour: 81% week: 62%');
    expect(option(result.agyGroups, 'Anthropic &amp; Other')).toContain('hour: 0% week: 19%');
    expect(option(result.agyGroups, 'Gemini 4 Argon')).toContain('week: 44%');
    expect(option(result.agents, 'Antigravity CLI')).toContain('Gemini hour: 81% week: 62%');
    expect(option(result.agents, 'Antigravity CLI')).toContain('Anthropic &amp; Other hour: 0% week: 19%');
    expect(option(result.agents, 'Antigravity CLI')).toContain('Gemini 4 Argon week: 44%');
    expect(option(result.agents, 'Claude Code')).toContain('hour: 75% week: 32%');
    expect(option(result.agents, 'Codex')).toContain('hour: 91% week: 55%');
    expect(option(result.agents, 'Auto')).not.toContain('%');
    expect(option(result.agents, 'OpenCode')).toContain('hour: 80% week: 70% month: 60%');
    expect(result.singleAgent).toHaveLength(1);
    expect(result.singleAgent[0]).toContain('Claude Code');
    expect(result.claude.every((row: string) => !row.includes('%') && !row.includes('quota'))).toBe(true);
    expect(result.codex.every((row: string) => !row.includes('%') && !row.includes('quota'))).toBe(true);
    expect(result.unknown.every((row: string) => row.includes('Quota unavailable'))).toBe(true);
    expect(result.partial.every((row: string) => row.includes('week: 0%') && !row.includes('hour:'))).toBe(true);
    expect(result.apiKey.every((row: string) => row.includes('API key billing · Quota unavailable') && !row.includes('80%'))).toBe(true);
    expect(result.bars.gemini.map((bar: { percent: number }) => bar.percent)).toEqual([81, 62]);
    expect(result.bars.other.map((bar: { percent: number }) => bar.percent)).toEqual([0, 19]);
    expect(result.bars.argon.map((bar: { percent: number }) => bar.percent)).toEqual([44]);
    expect(result.bars.gemini[1].style).toContain('hsl(120 70% 42%)');
    expect(result.bars.other[1].style).toContain('hsl(0 70% 42%)');
    expect(result.bars.other[0].style).toContain('width:0%');
    expect(result.bars.noReset[0].style).toContain('var(--text-muted)');
    expect(result.bars.unknown).toEqual([]);
    expect(result.bars.apiKey).toEqual([]);
    expect(result.loading.every((row: string) => row.includes('Loading quota'))).toBe(true);
  });

  test('resolveAgentType respects custom model option when provided', async () => {
    const agyResolved = await resolveAgentType('antigravity', [], {
      model: 'Gemini 3.8 Flash (High)',
    });
    expect(agyResolved.agentType).toBe('antigravity');
    expect(agyResolved.model).toBe('Gemini 3.8 Flash (High)');

    const claudeResolved = await resolveAgentType('claude', [], {
      model: 'haiku',
    });
    expect(claudeResolved.agentType).toBe('claude');
    expect(claudeResolved.model).toBe('haiku');

    const codexResolved = await resolveAgentType('codex', [], {
      model: 'gpt-6-sol',
    });
    expect(codexResolved.agentType).toBe('codex');
    expect(codexResolved.model).toBe('gpt-6-sol');
  });

  test('resolveAgentType always uses configured defaultModel and only omits model when defaultModel is empty', async ({ request }) => {
    const headers = { 'x-arondo-token': 'test-token-123456' };
    const before = await (await request.get('/api/settings', { headers })).json();
    try {
      // 1. With default config, lockedAgent without explicit model falls back to configured defaultModel
      await expect(resolveAgentType('auto', ['claude'], {
        lockedAgent: { agentType: 'claude' },
      })).resolves.toMatchObject({ agentType: 'claude', model: 'opus' });
      await expect(resolveAgentType('auto', ['agy'], {
        lockedAgent: { agentType: 'antigravity', agyQuotaGroup: 'other' },
      })).resolves.toMatchObject({ agentType: 'antigravity', model: 'Claude Sonnet 5.5 (Medium)' });
      await expect(resolveAgentType('auto', ['codex'], {
        lockedAgent: { agentType: 'codex' },
      })).resolves.toMatchObject({ agentType: 'codex', model: 'gpt-6-sol' });

      // 2. When defaultModel is cleared to empty string in Admin Settings, model is undefined in both direct and auto mode
      const clearRes = await request.post('/api/settings', {
        headers,
        data: {
          agentModels: {
            antigravity: {
              gemini: { defaultModel: '', availableModels: ['Gemini 3.8 Flash (High)'] },
              other: { defaultModel: '', availableModels: ['Claude Sonnet 5.5 (Medium)'] },
              argon: { defaultModel: '', availableModels: ['Gemini 4 Argon (Medium)'] },
            },
            claude: { defaultModel: '', availableModels: ['opus', 'sonnet'] },
            codex: { defaultModel: '', availableModels: ['gpt-6-sol'] },
            opencode: { defaultModel: '', availableModels: ['opencode-go/minimax-m3'] },
          },
        },
      });
      expect(clearRes.ok()).toBeTruthy();

      expect((await resolveAgentType('antigravity', ['agy'])).model).toBeUndefined();
      expect((await resolveAgentType('claude', ['claude'])).model).toBeUndefined();
      expect((await resolveAgentType('codex', ['codex'])).model).toBeUndefined();
      expect((await resolveAgentType('opencode', ['opencode'])).model).toBeUndefined();

      expect((await resolveAgentType('auto', ['agy']))?.model).toBeUndefined();
      expect((await resolveAgentType('auto', ['claude']))?.model).toBeUndefined();
      expect((await resolveAgentType('auto', ['codex']))?.model).toBeUndefined();
      expect((await resolveAgentType('auto', ['claude'], { lockedAgent: { agentType: 'claude' } }))?.model).toBeUndefined();
    } finally {
      await request.post('/api/settings', { headers, data: { agentModels: before.agentModels } });
    }
  });
});
