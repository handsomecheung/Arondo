import { test, expect } from '@playwright/test';
import { ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from './resume.helper';

test.describe('Session Conversation Resume integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../../mocks/bin/agy');
    const result = await setupRunner(request, 'resume-test-runner', mockBinDir);
    runnerProcess = result.runnerProcess;
    runnerId = result.runnerId;

    // Create mock repository directory to prevent execve ENOENT
    await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});
  });

  test.afterAll(async () => {
    // Clean up mock repository directory
    await fs.rm('/tmp/test-repo', { recursive: true, force: true }).catch(() => {});
    await teardownRunner(runnerProcess);
  });

  test('should resume conversation on follow-up message for the same agent', async ({ request }) => {
    // 1. Create a session with 'claude' agent and initial prompt
    console.log('[resume-test] Creating initial session for Claude resume...');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'Hello Claude 1',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        agentType: 'claude',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;
    expect(sessionId).toBeDefined();

    // Retrieve messages and verify command contains --session-id (isResume = false)
    const msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(msgsRes.status()).toBe(200);
    const messages = await msgsRes.json();
    const agentRunMsg = messages.find((m: any) => m.type === 'agent-run');
    expect(agentRunMsg).toBeDefined();
    expect(agentRunMsg.content).toContain(`--session-id "${sessionId}"`);
    expect(agentRunMsg.content).not.toContain('--resume');

    // Wait for session to finish executing (will exit with error since 'claude' binary is absent)
    console.log('[resume-test] Waiting for initial run to finish...');
    await waitForSessionNotRunning(request, sessionId);

    // 2. Send follow-up message to resume session
    console.log('[resume-test] Sending follow-up message for Claude resume...');
    const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Hello Claude 2',
      }
    });
    expect(msgRes.status()).toBe(200);

    // Retrieve messages and verify new command contains --resume (isResume = true)
    const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(msgsRes2.status()).toBe(200);
    const messages2 = await msgsRes2.json();
    const runMsgs = messages2.filter((m: any) => m.type === 'agent-run');
    expect(runMsgs.length).toBe(2);
    expect(runMsgs[1].content).toContain(`--resume "${sessionId}"`);
    expect(runMsgs[1].content).not.toContain('--session-id');

    // Cleanup session
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  });

  test('should apply agent switch rules: resume only when the target agent type has run before in this session', async ({ request }) => {
    // 1. Create a session with 'antigravity' agent and initial prompt
    console.log('[resume-test] Creating initial session for agent switch test...');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: 'Hello Switch 1',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        agentType: 'antigravity',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;
    expect(sessionId).toBeDefined();

    // Wait for it to finish running
    await waitForSessionNotRunning(request, sessionId);

    // 2. Patch session to switch to 'claude'
    console.log('[resume-test] Switching agent to Claude...');
    const updateRes = await request.patch(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        agentType: 'claude',
      }
    });
    expect(updateRes.status()).toBe(200);

    // 3. Post a follow-up message. Since Claude has NOT run before, it should NOT resume (isResume = false)
    console.log('[resume-test] Sending first message after switch (expect no resume)...');
    const msgRes1 = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Switch message 1',
      }
    });
    expect(msgRes1.status()).toBe(200);

    const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages1 = await msgsRes1.json();
    const runMsgs1 = messages1.filter((m: any) => m.type === 'agent-run');
    // Second run is claude, should have --session-id (no resume)
    expect(runMsgs1.length).toBe(2);
    expect(runMsgs1[1].resolvedAgentType).toBe('claude');
    expect(runMsgs1[1].content).toContain(`--session-id "${sessionId}"`);
    expect(runMsgs1[1].content).not.toContain('--resume');

    // Wait for it to finish running
    await waitForSessionNotRunning(request, sessionId);

    // 4. Post a second follow-up message using Claude. Since Claude HAS run before now, it should resume (isResume = true)
    console.log('[resume-test] Sending second message after switch (expect resume)...');
    const msgRes2 = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Switch message 2',
      }
    });
    expect(msgRes2.status()).toBe(200);

    const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const messages2 = await msgsRes2.json();
    const runMsgs2 = messages2.filter((m: any) => m.type === 'agent-run');
    // Third run is claude, should have --resume
    expect(runMsgs2.length).toBe(3);
    expect(runMsgs2[2].resolvedAgentType).toBe('claude');
    expect(runMsgs2[2].content).toContain(`--resume "${sessionId}"`);
    expect(runMsgs2[2].content).not.toContain('--session-id');

    // Cleanup session
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  });

  test('should accurately resume agy session based on AGY_DIR_LOG and mock binary output', async ({ request }) => {
    const mockBinDir = path.resolve(__dirname, '../../mocks/bin/agy');
    const mockLogDir = path.join(os.tmpdir(), `mock_agy_logs_${Math.random().toString(36).slice(2)}`);
    
    // Ensure clean directory
    await fs.mkdir(mockLogDir, { recursive: true }).catch(() => {});
    
    console.log('[resume-test] Spawning custom Go runner for agy mock test...');
    const result = await setupRunner(request, 'agy-mock-runner', mockBinDir, {
      AGY_DIR_LOG: mockLogDir,
    });
    const customRunner = result.runnerProcess;
    const customRunnerId = result.runnerId;

    try {
      // 1. Create a session with 'antigravity' agent on customRunnerId with prompt 'This is my first secret'
      console.log('[resume-test] Creating first mock agy session...');
      const createRes = await request.post('/api/sessions', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          prompt: 'This is my first secret',
          repoPath: '/tmp/test-repo',
          runnerId: customRunnerId,
          agentType: 'antigravity',
        }
      });
      expect(createRes.status()).toBe(201);
      const session = await createRes.json();
      const sessionId = session.id;
      
      // Wait for the run to complete
      await waitForSessionNotRunning(request, sessionId);

      // 2. Send follow-up message with prompt "what do I said before?"
      console.log('[resume-test] Sending follow-up to check context recall...');
      const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          message: 'what do I said before?',
        }
      });
      expect(msgRes.status()).toBe(200);

      // Wait for it to complete
      await waitForSessionNotRunning(request, sessionId);

      // Retrieve messages and look for the latest agent-run system message
      const msgsRes = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes.status()).toBe(200);
      const messages = await msgsRes.json();
      
      // Find the second agent-run message
      const runMsgs = messages.filter((m: any) => m.type === 'agent-run');
      expect(runMsgs.length).toBe(2);
      const secondRunMsg = runMsgs[1];

      // Fetch the log of this second run
      const logRes = await request.get(`/api/sessions/${sessionId}/log?messageId=${secondRunMsg.id}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(logRes.status()).toBe(200);
      const logData = await logRes.json();
      
      console.log(`[resume-test] Mock agy output log:\n${logData.log}`);
      
      // The log should contain exactly the first secret prompt: "This is my first secret"
      expect(logData.log).toContain('This is my first secret');

      // Cleanup session
      await request.delete(`/api/sessions/${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
    } finally {
      // Kill custom runner
      await teardownRunner(customRunner);
      // Clean up mock logs directory
      await fs.rm(mockLogDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
