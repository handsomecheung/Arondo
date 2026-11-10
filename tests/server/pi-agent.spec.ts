import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { getAgent, getAvailableAgents, getAgentBinaryNames, resolveAgentType } from '../../lib/agents';
import { PiAgent } from '../../lib/agents/pi';
import { parseDetachedAgentCommand, isDetachedAgentType } from '../../lib/detached-agent-command';
import { DEFAULT_AGENT_MODELS } from '../../lib/agentModels';
import { selectAgent } from '../../lib/autoagent';

const quotaPath = path.join(process.env.ARONDO_CONFIG_DIR!, 'autoagent', 'agent', 'quota.json');

async function writeQuota(quota: object) {
  await fs.mkdir(path.dirname(quotaPath), { recursive: true });
  await fs.writeFile(quotaPath, JSON.stringify(quota));
}

test.describe('Pi Integration', () => {
  test.afterEach(async () => {
    await fs.rm(quotaPath, { force: true });
  });

  test('is registered in agent factory and lists pi binary', () => {
    expect(getAvailableAgents()).toContain('pi');
    expect(getAgentBinaryNames()).toContain('pi');

    const agent = getAgent('pi');
    expect(agent).toBeInstanceOf(PiAgent);
    expect(agent.name).toBe('pi');
  });

  test('builds expected pi command with session, model, and thinking effort', () => {
    const agent = getAgent('pi');
    const cmd1 = agent.getCommand({
      prompt: 'hello world',
      repoPath: '/tmp/repo',
      sessionId: 'session-123',
      model: 'litellm/balanced-model',
      effort: 'medium',
    });
    expect(cmd1).toBe('pi -p --session-id "session-123" --model "litellm/balanced-model" --thinking "medium" -- "$(< "$ARONDO_PROMPT_FILE")"');

    const cmd2 = agent.getCommand({
      prompt: 'no session prompt',
      repoPath: '/tmp/repo',
    });
    expect(cmd2).toBe('pi -p -- "$(< "$ARONDO_PROMPT_FILE")"');
  });

  test('resolves default model for pi agent', async () => {
    const resolved = await resolveAgentType('pi', ['pi']);
    expect(resolved.agentType).toBe('pi');
    expect(resolved.model).toBe(DEFAULT_AGENT_MODELS.pi.defaultModel);
  });

  test('supports pi as detached agent type', () => {
    expect(isDetachedAgentType('pi')).toBe(true);

    const reviewCmd = parseDetachedAgentCommand('/review --agent pi Check code');
    expect(reviewCmd).toEqual({
      kind: 'review',
      agentType: 'pi',
      message: 'Check code',
    });

    const btwCmd = parseDetachedAgentCommand('/btw --agent pi What does this do?');
    expect(btwCmd).toEqual({
      kind: 'btw',
      agentType: 'pi',
      message: 'What does this do?',
    });
  });

  test('treats pi as an API billing agent in auto mode', async () => {
    // 1. When only Pi binary is available, auto mode selects Pi.
    const onlyPi = await selectAgent(['pi']);
    expect(onlyPi).toMatchObject({ agentType: 'pi' });

    // 2. When Claude is exhausted, auto mode falls back to Pi.
    await writeQuota({
      claude: { Type: 'claude', HourRemain: 1, WeekRemain: 0.01 },
    });
    const fallbackToPi = await selectAgent(['claude', 'pi']);
    expect(fallbackToPi).toMatchObject({ agentType: 'pi' });

    // 3. When Claude has healthy subscription quota, auto mode prefers Claude over Pi.
    await writeQuota({
      claude: { Type: 'claude', HourRemain: 0.9, WeekRemain: 0.8 },
    });
    const preferQuotaOverPi = await selectAgent(['claude', 'pi']);
    expect(preferQuotaOverPi).toMatchObject({ agentType: 'claude' });
  });
});
