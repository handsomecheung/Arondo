import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import { resolveAgentType } from '../../lib/agents';

test.describe('New Session Model Select UI & Logic', () => {
  test('SessionView renders Model dropdown with 3 groups for agy, correct models for claude/codex, and hides for auto/opencode', () => {
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
    expect(result.opencode.hasModelRow).toBe(false);
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
});
