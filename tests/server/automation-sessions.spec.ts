import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { setupRunner, teardownRunner } from './resume/resume.helper';
import { writeOnceCache } from '../../lib/store';

const headers = { 'x-arondo-token': 'test-token-123456' };
const configDir = process.env.ARONDO_CONFIG_DIR!;

async function openSocket(ui: boolean) {
  const socket = new WebSocket(`ws://localhost:3252/ws${ui ? '?ui=1' : ''}`, ['arondo-token', headers['x-arondo-token']]);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

async function setVisible(request: APIRequestContext, value: boolean) {
  const response = await request.post('/api/settings', { headers, data: { showAutomationSessions: value } });
  expect(response.ok()).toBeTruthy();
}

test.describe('Automation sessions', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;
  let runnerConfig: string;

  test.beforeAll(async ({ request }) => {
    runnerConfig = await fs.mkdtemp(path.join(configDir, 'automation-runner-'));
    ({ runnerProcess, runnerId } = await setupRunner(request, 'Automation Runner', path.resolve(__dirname, '../mocks/bin/claude'), { ARONDO_CONFIG_DIR: runnerConfig, CLAUDE_DIR_LOG: path.join(runnerConfig, 'claude-logs') }));
  });

  test.beforeEach(async ({ request }) => { await setVisible(request, false); });
  test.afterEach(async ({ request }) => { await setVisible(request, false); });
  test.afterAll(async () => { await teardownRunner(runnerProcess); });

  test('stores only session metadata, uses Runner config, and filters lists, tasks, todos, search, and streams', async ({ request }) => {
    const cliSocket = await openSocket(false);
    const uiSocket = await openSocket(true);
    const cliEvents: any[] = [];
    const uiEvents: any[] = [];
    cliSocket.on('message', data => cliEvents.push(JSON.parse(data.toString())));
    uiSocket.on('message', data => uiEvents.push(JSON.parse(data.toString())));
    let sessionId = '';
    try {
      const response = await request.post('/api/sessions', {
        headers, data: { automation: true, runnerId, agentType: 'claude', prompt: 'automation-search-marker' },
      });
      expect(response.status()).toBe(201);
      const session = await response.json();
      sessionId = session.id;
      expect(session.automation).toBe(true);
      expect(session.noProject).toBe(true);
      expect(session.projectId).toBeUndefined();
      expect(session.tempDir).toBeUndefined();
      expect(path.dirname(session.repoPath)).toBe(path.join(runnerConfig, 'automation-workspaces'));
      expect(path.basename(session.repoPath)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z-\w+$/);
      expect((await fs.stat(session.repoPath)).isDirectory()).toBe(true);
      const saved = JSON.parse(await fs.readFile(path.join(configDir, 'sessions', session.id, 'session.json'), 'utf8'));
      expect(saved.automation).toBe(true);
      const projects = await (await request.get('/api/projects', { headers })).json();
      expect(projects.some((p: any) => p.repoPath === session.repoPath)).toBe(false);
      expect((await request.get(`/api/sessions/${session.id}`, { headers })).status()).toBe(200);

      await expect.poll(async () => (await (await request.get(`/api/sessions/${session.id}`, { headers })).json()).status).toBe('done');
      const followup = await request.post(`/api/sessions/${session.id}/messages`, { headers, data: { message: 'Follow-up automation' } });
      expect(followup.ok()).toBeTruthy();
      await expect.poll(async () => (await (await request.get(`/api/sessions/${session.id}`, { headers })).json()).status).toBe('done');
      const todo = await request.post(`/api/sessions/${session.id}/todo-messages`, { headers, data: { message: 'automation todo', trigger: { kind: 'manual' } } });
      expect(todo.ok()).toBeTruthy();
      for (const endpoint of ['/api/sessions', '/api/tasks', '/api/todo-messages']) {
        const items = await (await request.get(endpoint, { headers })).json();
        expect(items.some((item: any) => item.id === session.id || item.sessionId === session.id)).toBe(false);
      }
      const search = await (await request.get('/api/sessions/search?q=automation-search-marker', { headers })).json();
      expect(search.sessionIds).not.toContain(session.id);
      await expect.poll(() => cliEvents.some(e => e.type === 'terminal:output' && e.sessionId === session.id)).toBe(true);
      expect(uiEvents.some(e => e.payload?.id === session.id || e.payload?.sessionId === session.id || e.sessionId === session.id)).toBe(false);

      await setVisible(request, true);
      for (const endpoint of ['/api/sessions', '/api/tasks', '/api/todo-messages']) {
        const items = await (await request.get(endpoint, { headers })).json();
        expect(items.some((item: any) => item.id === session.id || item.sessionId === session.id)).toBe(true);
      }
      const visibleSearch = await (await request.get('/api/sessions/search?q=automation-search-marker', { headers })).json();
      expect(visibleSearch.sessionIds).toContain(session.id);
      await request.patch(`/api/sessions/${session.id}`, { headers, data: { name: 'Visible automation' } });
      await expect.poll(() => uiEvents.some(e => e.payload?.id === session.id && e.payload?.name === 'Visible automation')).toBe(true);

      expect((await request.post(`/api/sessions/${session.id}/archive`, { headers })).ok()).toBeTruthy();
      await setVisible(request, false);
      expect((await (await request.get('/api/sessions/archived', { headers })).json()).some((s: any) => s.id === session.id)).toBe(false);
      await setVisible(request, true);
      expect((await (await request.get('/api/sessions/archived', { headers })).json()).some((s: any) => s.id === session.id)).toBe(true);
      expect((await request.post(`/api/sessions/${session.id}/unarchive`, { headers })).ok()).toBeTruthy();
      await request.delete(`/api/sessions/${session.id}`, { headers });
      expect((await fs.stat(session.repoPath)).isDirectory()).toBe(true);
      sessionId = "";
    } finally {
      cliSocket.close();
      uiSocket.close();
      if (sessionId) await request.delete(`/api/sessions/${sessionId}`, { headers });
    }
  });

  test('supports once and cached outputs without creating a project', async ({ request }) => {
    const prompt = `automation cache ${Date.now()}`;
    await writeOnceCache(prompt, 'cached automation output');
    const response = await request.post('/api/sessions', { headers, data: { automation: true, runnerId, once: true, cache: 'on', prompt } });
    expect(response.status()).toBe(201);
    const session = await response.json();
    try {
      expect(session.status).toBe('done');
      expect(session.automation).toBe(true);
      expect(session.once).toBe(true);
      expect(session.projectId).toBeUndefined();
      const messages = await (await request.get(`/api/messages?sessionId=${session.id}`, { headers })).json();
      const run = messages.find((m: any) => m.type === 'agent-run');
      expect(run).toBeDefined();
      const log = await (await request.get(`/api/sessions/${session.id}/log?messageId=${run.id}`, { headers })).json();
      expect(log.log).toBe('cached automation output');
      const followup = await request.post(`/api/sessions/${session.id}/messages`, { headers, data: { message: 'again' } });
      expect(followup.status()).toBe(400);
    } finally {
      await request.delete(`/api/sessions/${session.id}`, { headers });
    }
  });

  test('rejects conflicting workspace options and restricts the visibility setting to admins', async ({ request }) => {
    for (const conflict of [{ repoPath: '/repo' }, { tempDir: true }, { noProject: true }]) {
      const response = await request.post('/api/sessions', { headers, data: { automation: true, runnerId, prompt: '', ...conflict } });
      expect(response.status()).toBe(400);
    }
    const invalid = await request.post('/api/settings', { headers, data: { showAutomationSessions: 'yes' } });
    expect(invalid.status()).toBe(400);
    const forbidden = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-user-token-7890' }, data: { showAutomationSessions: true },
    });
    expect(forbidden.status()).toBe(403);
  });
});
