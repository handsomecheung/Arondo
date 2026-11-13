import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_AGENT_MODELS } from '../../lib/agentModels';
import type { Session } from '../../types/home';

test.use({ actionTimeout: 10_000, trace: 'retain-on-failure' });

const agents = [
  { label: 'Claude Code', value: 'claude', family: 'opus', effort: 'high' },
  { label: 'Codex', value: 'codex', family: 'gpt-6-sol', effort: 'high' },
  { label: 'OpenCode', value: 'opencode', family: 'opencode-go/minimax-m3', effort: 'thinking' },
  { label: 'Pi', value: 'pi', family: 'litellm/balanced-model', effort: 'high' },
  { label: 'Antigravity CLI', value: 'antigravity', family: 'Gemini 3.8 Flash', effort: 'High' },
];

async function mockSessionPage(page: Page, existing = false, installedAgents = ['agy', 'claude', 'codex', 'opencode', 'pi'], runnerState: 'connected' | 'offline' | 'missing' = 'connected') {
  let session: Session = {
    id: 'effort-session', name: 'Effort session', agentType: 'antigravity',
    status: 'idle', runnerId: 'effort-runner', repoPath: '/tmp/effort-test',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const writes: Array<{ agentType: string; model: string }> = [];
  await page.addInitScript(() => localStorage.setItem('arondo_token', 'test-token-123456'));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/settings') return route.fulfill({ json: { agentModels: DEFAULT_AGENT_MODELS } });
    if (pathname === '/api/runners') return route.fulfill({ json: runnerState === 'missing' ? [] : [{
      id: 'effort-runner', name: 'Effort Runner', connected: runnerState === 'connected',
      hostname: 'localhost', os: 'linux', arch: 'amd64', agents: installedAgents,
    }] });
    if (pathname === '/api/sessions') return route.fulfill({ json: existing ? [session] : [] });
    if (pathname === `/api/sessions/${session.id}`) {
      if (route.request().method() === 'PATCH') {
        const patch = route.request().postDataJSON();
        writes.push(patch);
        session = { ...session, ...patch };
      }
      return route.fulfill({ json: session });
    }
    if (pathname === '/api/agents/info') return route.fulfill({ json: {} });
    if (pathname.endsWith('/path-status')) return route.fulfill({ json: { exists: true } });
    if (['/api/projects', '/api/tasks', '/api/messages', '/api/agent-commands'].includes(pathname)) {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
  await page.goto(existing ? '/session/effort-session' : '/');
  if (!existing) await page.getByRole('button', { name: 'Create your session', exact: true }).click();
  return writes;
}

async function expectMessageInputDisabled(page: Page, advice = 'Install an Agent CLI on this Runner to send messages.') {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/sessions(?:$|\/[^/]+\/(?:messages|todo-messages|detached-agent-runs)$)/.test(new URL(request.url()).pathname)) {
      requests.push(request.url());
    }
  });
  const input = page.locator('#chat-input');
  const send = page.locator('#send-btn');
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', advice);
  await expect(page.getByRole('button', { name: 'Attach a file or schedule this message', exact: true })).toBeDisabled();
  await expect(send).toBeDisabled();
  await expect(send).toHaveAttribute('title', advice);
  await input.dispatchEvent('keydown', { key: 'Enter' });
  await send.dispatchEvent('click');
  await expect(input).toHaveValue('');
  expect(requests).toEqual([]);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`Thinking effort at ${viewport.width}px`, () => {
    test.use({ viewport });
    test.setTimeout(120_000);

    for (const runnerState of ['missing', 'offline'] as const) {
      test(`${runnerState} Runners disable selection and chat with connection advice`, async ({ page }) => {
        await mockSessionPage(page, false, [], runnerState);
        const advice = 'Connect a Runner to select an agent and send messages.';
        const trigger = page.locator('#runner-select-trigger');
        await expect(trigger).toBeDisabled();
        await expect(trigger).toHaveText('No runners available');
        await expect(trigger).toHaveAccessibleDescription(advice);
        await expect(page.locator('#runner-connection-advice')).toBeVisible();
        await trigger.dispatchEvent('click');
        await expect(page.locator('.runner-meta-row .custom-dropdown-menu')).toHaveCount(0);
        await expect(page.locator('#agent-select-trigger')).toBeDisabled();
        await expect(page.locator('#agent-install-advice')).toHaveCount(0);
        await expectMessageInputDisabled(page, advice);
      });
    }

    test('empty Runner disables agent selection and shows installation advice', async ({ page }) => {
      await mockSessionPage(page, false, []);
      const trigger = page.locator('#agent-select-trigger');
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveText('No agents available');
      await expect(page.locator('#agent-install-advice')).toBeVisible();
      await expect(trigger).toHaveAccessibleDescription('Install an Agent CLI on this Runner to select an agent.');
      await trigger.dispatchEvent('click');
      await expect(page.locator('.agent-meta-row .custom-dropdown-menu')).toHaveCount(0);
      await expectMessageInputDisabled(page);
    });

    test('empty Runner disables the session agent switch and shows installation advice', async ({ page }) => {
      await mockSessionPage(page, true, []);
      const trigger = page.getByTitle('Install an Agent CLI on this Runner to select an agent.', { exact: true });
      await expect(trigger).toBeDisabled();
      await expect(page.locator('#session-agent-install-advice')).toBeVisible();
      await expect(trigger).toHaveAccessibleDescription('Install an Agent CLI on this Runner to select an agent.');
      await trigger.dispatchEvent('click');
      await expect(page.locator('.session-agent-switch-menu')).toHaveCount(0);
      await expectMessageInputDisabled(page);
    });

    test('New Session keeps effort visible after changing it and the model family', async ({ page }) => {
      await mockSessionPage(page);
      await expect(page.locator('#chat-input')).toBeEnabled();
      const choices = page.getByRole('tablist', { name: 'Thinking effort' });
      for (const agent of agents) {
        await page.locator('#agent-select-trigger').click();
        await page.locator('.agent-meta-row .new-session-dropdown-menu').getByRole('button').filter({ has: page.getByText(agent.label, { exact: true }) }).click();
        await expect(choices).toBeVisible();
        await choices.getByRole('tab', { name: agent.effort, exact: true }).click();
        await expect(choices).toBeVisible();
        await expect(choices.getByRole('tab', { name: agent.effort, exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#model-select-trigger')).toHaveText(agent.family);
        await page.locator('#model-select-trigger').click();
        await page.locator('.new-session-model-dropdown-menu').getByRole('button', { name: 'Default', exact: true }).click();
        await expect(choices).toBeVisible();
      }
    });

    test('header shows effort for other agents, persists choices and keeps it above the scrolling models', async ({ page }) => {
      const writes = await mockSessionPage(page, true);
      await expect(page.locator('#chat-input')).toBeEnabled();
      for (const agent of agents) {
        await page.getByTitle('Switch agent', { exact: true }).click();
        await expect(page.locator('.session-agent-switch-menu').getByText(agent.family, { exact: true })).toHaveCount(0);
        await page.locator('.session-agent-switch-menu').getByRole('button').filter({ has: page.getByText(agent.label, { exact: true }) }).click();
        const dialog = page.getByRole('dialog');
        const choices = dialog.getByRole('tablist', { name: 'Thinking effort' });
        await expect(choices).toBeVisible();
        await dialog.evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
        const bounds = await choices.boundingBox();
        const models = dialog.locator('.session-agent-popup-list');
        await models.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        if (agent.value === 'opencode') expect(await models.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect(await choices.boundingBox()).toEqual(bounds);
        await choices.getByRole('tab', { name: agent.effort, exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const model = agent.value === 'antigravity' ? `${agent.family} (${agent.effort})`
          : `${agent.family}${agent.value === 'opencode' ? '#' : ' '}${agent.effort}`;
        expect(writes.at(-1)).toEqual({ agentType: agent.value, model });
        await page.getByTitle('Switch agent', { exact: true }).click();
        await page.locator('.session-agent-switch-menu').getByRole('button').filter({ has: page.getByText(agent.label, { exact: true }) }).click();
        await expect(choices.getByRole('tab', { name: agent.effort, exact: true })).toHaveAttribute('aria-selected', 'true');
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        await page.locator('.task-info-bar').click({ position: { x: 1, y: 1 } });
      }
    });
  });
}
