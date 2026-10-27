import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

test.describe('Session HTML rendering API integration tests', () => {
  const testConfigDir = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
  const sessionId = 'test-session-html-456';
  const messageId = 'test-msg-agent-run-789';
  const sessionDir = path.join(testConfigDir, 'sessions', sessionId);
  const logsDir = path.join(sessionDir, 'logs');

  test.beforeAll(async () => {
    await fs.mkdir(logsDir, { recursive: true });

    // Create session.json
    const sessionData = {
      id: sessionId,
      name: 'Test HTML Session',
      status: 'done',
      agentType: 'agy',
      repoPath: '/tmp/repo',
      runnerId: 'test-runner-html',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(sessionData, null, 2), 'utf-8');

    // Create messages.json
    const messages = [
      {
        id: 'msg-user-1',
        sessionId,
        role: 'user',
        type: 'chat-user',
        content: 'Format this',
        createdAt: new Date().toISOString(),
      },
      {
        id: messageId,
        sessionId,
        role: 'system',
        type: 'agent-run',
        content: 'Execution completed',
        createdAt: new Date().toISOString(),
      },
    ];
    await fs.writeFile(path.join(sessionDir, 'messages.json'), JSON.stringify(messages, null, 2), 'utf-8');

    // Write stdout log
    const logContent = "\u001b[32mSuccess\u001b[0m\n\n# Hello World\n\n```typescript\nconst answer = 42;\n```";
    await fs.writeFile(path.join(logsDir, `${messageId}.agent.stdout.md`), logContent, 'utf-8');
  });

  test.afterAll(async () => {
    await fs.rm(sessionDir, { recursive: true, force: true });
  });

  test('GET /api/sessions/:id/html without messageId auto-resolves latest agent run and renders markdown HTML', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/html`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.html).toContain('<!--arondo-agent-output-html-v4-->');
    expect(data.html).toContain('<h1>Hello World</h1>');
    expect(data.html).toContain('<code class="hljs language-typescript">');

    // Verify it was cached to disk
    const cachedFile = path.join(logsDir, `${messageId}.agent.stdout.html`);
    const cachedContent = await fs.readFile(cachedFile, 'utf-8');
    expect(cachedContent).toBe(data.html);
  });

  test('GET /api/sessions/:id/html with messageId returns cached HTML', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/html?messageId=${messageId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.html).toContain('<h1>Hello World</h1>');
  });
});
