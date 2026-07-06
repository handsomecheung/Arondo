import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from '../resume.helper';

const CONFIG_DIR_RUNTIME = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
const AGY_SESSION_MAP_FILE = path.join(CONFIG_DIR_RUNTIME, 'agy-sessions.json');

/** Wait until agy-sessions.json contains a mapping for sessionId. */
async function waitForAgySessionMapped(sessionId: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(AGY_SESSION_MAP_FILE, 'utf-8');
      const map = JSON.parse(raw);
      if (map[sessionId]) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for agy session mapping for ${sessionId}`);
}

test.describe('Automode Session Resume and Handoff Tests', () => {
  const CONFIG_DIR = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
  const quotaPath = path.join(CONFIG_DIR, 'autoselect', 'agent', 'quota.json');

  test.beforeEach(async () => {
    await fs.mkdir(path.dirname(quotaPath), { recursive: true }).catch(() => {});
  });

  test.afterEach(async () => {
    await fs.rm(quotaPath, { force: true }).catch(() => {});
  });

  test('C -> A: should successfully handoff context from claude to agy (Gemini Flash)', async ({ request }) => {
    await runTransitionTest(
      request,
      'C', 'A',
      'claude', 'antigravity',
      undefined, 'Gemini 3.5 Flash (Medium)',
      true,
      quotaPath
    );
  });

  test('A -> B: should successfully resume within agy from Gemini Flash to Claude Sonnet 4.6', async ({ request }) => {
    await runTransitionTest(
      request,
      'A', 'B',
      'antigravity', 'antigravity',
      'Gemini 3.5 Flash (Medium)', 'Claude Sonnet 4.6 (Thinking)',
      false,
      quotaPath
    );
  });

  test('A -> C: should successfully handoff context from agy (Gemini Flash) to claude', async ({ request }) => {
    await runTransitionTest(
      request,
      'A', 'C',
      'antigravity', 'claude',
      'Gemini 3.5 Flash (Medium)', undefined,
      true,
      quotaPath
    );
  });

  test('B -> C: should successfully handoff context from agy (Claude Sonnet 4.6) to claude', async ({ request }) => {
    await runTransitionTest(
      request,
      'B', 'C',
      'antigravity', 'claude',
      'Claude Sonnet 4.6 (Thinking)', undefined,
      true,
      quotaPath
    );
  });

  test('B -> A: should successfully resume within agy from Claude Sonnet 4.6 to Gemini Flash', async ({ request }) => {
    await runTransitionTest(
      request,
      'B', 'A',
      'antigravity', 'antigravity',
      'Claude Sonnet 4.6 (Thinking)', 'Gemini 3.5 Flash (Medium)',
      false,
      quotaPath
    );
  });

  test('C -> B: should successfully handoff context from claude to agy (Claude Sonnet 4.6)', async ({ request }) => {
    await runTransitionTest(
      request,
      'C', 'B',
      'claude', 'antigravity',
      undefined, 'Claude Sonnet 4.6 (Thinking)',
      true,
      quotaPath
    );
  });

  test('A -> A: should carry agy conversation ID (--conversation) on second call in auto mode', async ({ request }) => {
    await runSameChoiceResumeTest(request, 'A', quotaPath);
  });

  test('B -> B: should carry agy conversation ID (--conversation) on second call in auto mode', async ({ request }) => {
    await runSameChoiceResumeTest(request, 'B', quotaPath);
  });

  test('C -> C: should carry session ID (--resume) on second call in auto mode', async ({ request }) => {
    await runSameChoiceResumeTest(request, 'C', quotaPath);
  });

  test('A -> A -> B -> A: should carry conversation ID and context between model changes of the same agent', async ({ request }) => {
    await runXXYXTest(request, 'A', 'B', quotaPath);
  });

  test('B -> B -> C -> B: should carry conversation ID/session ID and context when switching back and forth', async ({ request }) => {
    await runXXYXTest(request, 'B', 'C', quotaPath);
  });

  test('C -> C -> A -> C: should carry session ID/conversation ID and context when switching back and forth', async ({ request }) => {
    await runXXYXTest(request, 'C', 'A', quotaPath);
  });
});

function getQuotaForChoice(choiceId: 'A' | 'B' | 'C') {
  return {
    "antigravity_arondo@gmail.com_Google AI Pro": {
      "Type": "antigravity",
      "Account": "arondo@gmail.com",
      "Plan": "Google AI Pro",
      "DefaultModel": "Gemini 3.5 Flash (Medium)",
      "GeminiWeeklyRemain": choiceId === 'A' ? 0.9 : 0.1,
      "GeminiWeeklyResetsAt": null,
      "GeminiHourRemain": 1.0,
      "GeminiHourResetsAt": null,
      "OtherWeeklyRemain": choiceId === 'B' ? 0.9 : 0.1,
      "OtherWeeklyResetsAt": null,
      "OtherHourRemain": 1.0,
      "OtherHourResetsAt": null,
      "updatedAt": Math.floor(Date.now() / 1000)
    },
    "claude_arondo@gmail.com_Claude Pro account": {
      "Type": "claude",
      "Account": "arondo@gmail.com",
      "Plan": "Claude Pro account",
      "DefaultModel": "Default (Sonnet 5 · Efficient for routine tasks)",
      "HourRemain": 1.0,
      "HourResetAt": null,
      "WeekRemain": choiceId === 'C' ? 0.9 : 0.1,
      "WeekResetsAt": null,
      "updatedAt": Math.floor(Date.now() / 1000)
    }
  };
}

async function runTransitionTest(
  request: any,
  fromChoice: 'A' | 'B' | 'C',
  toChoice: 'A' | 'B' | 'C',
  expectedFromAgent: 'claude' | 'antigravity',
  expectedToAgent: 'claude' | 'antigravity',
  expectedFromModel: string | undefined,
  expectedToModel: string | undefined,
  isAgentSwitch: boolean,
  quotaPath: string
) {
  const mockBinDir = `${path.resolve(__dirname, '../../../mocks/bin/agy')}:${path.resolve(__dirname, '../../../mocks/bin/claude')}`;
  
  const agyLogDir = path.join(os.tmpdir(), `mock_automode_agy_logs_${Math.random().toString(36).slice(2)}`);
  const claudeLogDir = path.join(os.tmpdir(), `mock_automode_claude_logs_${Math.random().toString(36).slice(2)}`);
  
  await fs.mkdir(agyLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir(claudeLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});

  // Write initial quota
  await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(fromChoice), null, 2), 'utf-8');

  const name = `runner-${fromChoice}-to-${toChoice}`;
  console.log(`[automode-test] Spawning runner for ${fromChoice} -> ${toChoice}...`);
  const result = await setupRunner(request, name, mockBinDir, {
    AGY_DIR_LOG: agyLogDir,
    CLAUDE_DIR_LOG: claudeLogDir,
  });
  const runnerProcess = result.runnerProcess;
  const runnerId = result.runnerId;

  try {
    // Start session in "auto" mode
    console.log('[automode-test] Creating session in auto mode...');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'Hello Automode 1',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        agentType: 'auto',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;

    // Wait for it to complete
    await waitForSessionNotRunning(request, sessionId);

    // Verify the first run selected expectedFromAgent
    const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(msgsRes1.status()).toBe(200);
    const messages1 = await msgsRes1.json();
    const runMsgs1 = messages1.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs1.length).toBe(1);
    expect(runMsgs1[0].resolvedAgentType).toBe(expectedFromAgent);

    // Write second quota
    await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(toChoice), null, 2), 'utf-8');

    // Send follow-up message to trigger transition
    console.log('[automode-test] Sending follow-up message...');
    const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'what do I said before?',
      }
    });
    expect(msgRes.status()).toBe(200);

    // Wait for follow-up run to complete
    await waitForSessionNotRunning(request, sessionId);

    // Verify that the second run selected expectedToAgent
    const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(msgsRes2.status()).toBe(200);
    const messages2 = await msgsRes2.json();
    const runMsgs2 = messages2.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs2.length).toBe(2);
    expect(runMsgs2[1].resolvedAgentType).toBe(expectedToAgent);

    const secondRunMsg = runMsgs2[1];
    console.log(`[automode-test] Second run prompt:\n${secondRunMsg.prompt}`);

    if (isAgentSwitch) {
      // Assert that the context of previous conversation is prepended to the prompt
      const prevLabel = expectedFromAgent === 'claude' ? 'Claude Code' : 'Antigravity CLI';
      const mockLabel = expectedFromAgent === 'claude' ? 'claude' : 'agy';
      
      expect(secondRunMsg.prompt).toContain(`[Previous conversation context from ${prevLabel}]`);
      expect(secondRunMsg.prompt).toContain('User: Hello Automode 1');
      expect(secondRunMsg.prompt).toContain(`Mock ${mockLabel} received: Hello Automode 1`);
      expect(secondRunMsg.prompt).toContain('[End of previous context]');
      expect(secondRunMsg.prompt).toContain('what do I said before?');
    } else {
      // Assert it did NOT prepend cross-agent context since it's the same agent
      expect(secondRunMsg.prompt).not.toContain('[Previous conversation context from');
      expect(secondRunMsg.prompt).toBe('what do I said before?');
    }

    // Verify commands option `--model` changes as expected
    if (expectedToModel) {
      expect(secondRunMsg.content).toContain(`--model "${expectedToModel}"`);
    }

    // Cleanup session
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  } finally {
    await teardownRunner(runnerProcess);
    await fs.rm(agyLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(claudeLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
  }
}

async function runSameChoiceResumeTest(
  request: any,
  choice: 'A' | 'B' | 'C',
  quotaPath: string
) {
  const mockBinDir = `${path.resolve(__dirname, '../../../mocks/bin/agy')}:${path.resolve(__dirname, '../../../mocks/bin/claude')}`;
  const agyLogDir = path.join(os.tmpdir(), `mock_automode_agy_same_${Math.random().toString(36).slice(2)}`);
  const claudeLogDir = path.join(os.tmpdir(), `mock_automode_claude_same_${Math.random().toString(36).slice(2)}`);

  await fs.mkdir(agyLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir(claudeLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});

  // Fix quota so the same choice wins both times
  await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(choice), null, 2), 'utf-8');

  const name = `runner-${choice}-to-${choice}`;
  const result = await setupRunner(request, name, mockBinDir, {
    AGY_DIR_LOG: agyLogDir,
    CLAUDE_DIR_LOG: claudeLogDir,
  });
  const runnerProcess = result.runnerProcess;
  const runnerId = result.runnerId;

  try {
    // First call
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'Hello Same Choice 1',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        agentType: 'auto',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;

    await waitForSessionNotRunning(request, sessionId);

    // Verify first run chose the expected choice and has no resume flag yet
    const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages1 = await msgsRes1.json();
    const runMsgs1 = messages1.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs1.length).toBe(1);

    const expectedAgent = choice === 'C' ? 'claude' : 'antigravity';
    expect(runMsgs1[0].resolvedAgentType).toBe(expectedAgent);

    if (choice === 'C') {
      // Claude: first call has --session-id, not --resume
      expect(runMsgs1[0].content).toContain(`--session-id "${sessionId}"`);
      expect(runMsgs1[0].content).not.toContain('--resume');
    } else {
      // agy: first call has no --conversation flag
      expect(runMsgs1[0].content).not.toContain('--conversation');
      // Wait for saveAgySessionId to finish writing (it runs after DB update)
      await waitForAgySessionMapped(sessionId);
    }

    // Second call (same quota → same choice)
    const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { message: 'Hello Same Choice 2' }
    });
    expect(msgRes.status()).toBe(200);

    await waitForSessionNotRunning(request, sessionId);

    const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages2 = await msgsRes2.json();
    const runMsgs2 = messages2.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs2.length).toBe(2);
    expect(runMsgs2[1].resolvedAgentType).toBe(expectedAgent);

    const secondCmd = runMsgs2[1].content;
    console.log(`[automode-test] ${choice}->${choice} second run command:\n${secondCmd}`);

    if (choice === 'C') {
      // Claude: second call must use --resume instead of --session-id
      expect(secondCmd).toContain(`--resume "${sessionId}"`);
      expect(secondCmd).not.toContain('--session-id');
    } else {
      // agy: second call must carry --conversation <agyConversationId>
      expect(secondCmd).toContain('--conversation');
      expect(secondCmd).not.toContain('--prompt "$(< "$ARONDO_PROMPT_FILE") --add-dir');
    }

    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  } finally {
    await teardownRunner(runnerProcess);
    await fs.rm(agyLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(claudeLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
  }
}

async function runXXYXTest(
  request: any,
  X: 'A' | 'B' | 'C',
  Y: 'A' | 'B' | 'C',
  quotaPath: string
) {
  const mockBinDir = `${path.resolve(__dirname, '../../../mocks/bin/agy')}:${path.resolve(__dirname, '../../../mocks/bin/claude')}`;
  const agyLogDir = path.join(os.tmpdir(), `mock_automode_agy_xxyx_${X}_${Y}_${Math.random().toString(36).slice(2)}`);
  const claudeLogDir = path.join(os.tmpdir(), `mock_automode_claude_xxyx_${X}_${Y}_${Math.random().toString(36).slice(2)}`);

  await fs.mkdir(agyLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir(claudeLogDir, { recursive: true }).catch(() => {});
  await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});

  const getAgentInfo = (choice: 'A' | 'B' | 'C') => {
    if (choice === 'C') return { agent: 'claude', model: undefined };
    if (choice === 'A') return { agent: 'antigravity', model: 'Gemini 3.5 Flash (Medium)' };
    return { agent: 'antigravity', model: 'Claude Sonnet 4.6 (Thinking)' };
  };

  const xInfo = getAgentInfo(X);
  const yInfo = getAgentInfo(Y);

  // Setup runner with choice X first
  await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(X), null, 2), 'utf-8');

  const name = `runner-${X}-${Y}`;
  const result = await setupRunner(request, name, mockBinDir, {
    AGY_DIR_LOG: agyLogDir,
    CLAUDE_DIR_LOG: claudeLogDir,
  });
  const runnerProcess = result.runnerProcess;
  const runnerId = result.runnerId;

  try {
    // 1. First call: X ("Hello X1")
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: `Hello ${X}1`,
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        agentType: 'auto',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;

    await waitForSessionNotRunning(request, sessionId);

    // Verify Call 1 ran X
    const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages1 = await msgsRes1.json();
    const runMsgs1 = messages1.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs1.length).toBe(1);
    expect(runMsgs1[0].resolvedAgentType).toBe(xInfo.agent);
    if (xInfo.model) {
      expect(runMsgs1[0].content).toContain(`--model "${xInfo.model}"`);
    }

    if (xInfo.agent === 'antigravity') {
      await waitForAgySessionMapped(sessionId);
    }

    // 2. Second call: X ("Hello X2")
    const msgRes2 = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { message: `Hello ${X}2` }
    });
    expect(msgRes2.status()).toBe(200);
    await waitForSessionNotRunning(request, sessionId);

    // Verify Call 2 carried X's conversation ID or session ID
    const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages2 = await msgsRes2.json();
    const runMsgs2 = messages2.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs2.length).toBe(2);
    if (xInfo.agent === 'antigravity') {
      expect(runMsgs2[1].content).toContain('--conversation');
    } else {
      expect(runMsgs2[1].content).toContain(`--resume "${sessionId}"`);
    }

    // 3. Third call: Y ("Hello Y")
    // Write choice Y quota
    await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(Y), null, 2), 'utf-8');

    const msgRes3 = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { message: `Hello ${Y}` }
    });
    expect(msgRes3.status()).toBe(200);
    await waitForSessionNotRunning(request, sessionId);

    // Verify Call 3 ran Y with its corresponding model
    const msgsRes3 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages3 = await msgsRes3.json();
    const runMsgs3 = messages3.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs3.length).toBe(3);
    expect(runMsgs3[2].resolvedAgentType).toBe(yInfo.agent);
    if (yInfo.model) {
      expect(runMsgs3[2].content).toContain(`--model "${yInfo.model}"`);
    }

    // 4. Fourth call: X ("what do I said before?")
    // Write choice X quota back
    await fs.writeFile(quotaPath, JSON.stringify(getQuotaForChoice(X), null, 2), 'utf-8');

    const msgRes4 = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { message: 'what do I said before?' }
    });
    expect(msgRes4.status()).toBe(200);
    await waitForSessionNotRunning(request, sessionId);

    // Verify Call 4 ran X with X's resume properties and recalled Y's context
    const msgsRes4 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages4 = await msgsRes4.json();
    const runMsgs4 = messages4.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs4.length).toBe(4);
    
    expect(runMsgs4[3].resolvedAgentType).toBe(xInfo.agent);
    if (xInfo.agent === 'antigravity') {
      expect(runMsgs4[3].content).toContain('--conversation');
    } else {
      expect(runMsgs4[3].content).toContain(`--resume "${sessionId}"`);
    }

    // Get the log for call 4 to check if mock output has Y's prompt
    const logRes = await request.get(`/api/sessions/${sessionId}/log?messageId=${runMsgs4[3].id}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(logRes.status()).toBe(200);
    const logText = await logRes.text();

    expect(logText).toContain(`Hello ${X}1`);
    expect(logText).toContain(`Hello ${X}2`);
    expect(logText).toContain(`Hello ${Y}`);

    // Cleanup session
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  } finally {
    await teardownRunner(runnerProcess);
    await fs.rm(agyLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(claudeLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
  }
}
