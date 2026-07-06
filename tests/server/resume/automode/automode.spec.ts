import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { setupRunner, teardownRunner, waitForSessionNotRunning } from '../resume.helper';

test.describe('Automode Session Resume and Handoff Tests', () => {
  const CONFIG_DIR = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
  const quotaPath = path.join(CONFIG_DIR, 'autoselect', 'agent', 'quota.json');

  test.beforeEach(async () => {
    await fs.mkdir(path.dirname(quotaPath), { recursive: true }).catch(() => {});
  });

  test.afterEach(async () => {
    await fs.rm(quotaPath, { force: true }).catch(() => {});
  });

  test('should successfully handoff context between agy and claude in automode based on quota changes', async ({ request }) => {
    const mockBinDir = `${path.resolve(__dirname, '../../../mocks/bin/agy')}:${path.resolve(__dirname, '../../../mocks/bin/claude')}`;
    
    const agyLogDir = path.join(os.tmpdir(), `mock_automode_agy_logs_${Math.random().toString(36).slice(2)}`);
    const claudeLogDir = path.join(os.tmpdir(), `mock_automode_claude_logs_${Math.random().toString(36).slice(2)}`);
    
    await fs.mkdir(agyLogDir, { recursive: true }).catch(() => {});
    await fs.mkdir(claudeLogDir, { recursive: true }).catch(() => {});
    await fs.mkdir('/tmp/test-repo', { recursive: true }).catch(() => {});

    // Step 1: Write quota.json to select Claude first (Claude has high quota, antigravity has low quota)
    const selectClaudeQuota = {
      "antigravity_arondo@gmail.com_Google AI Pro": {
        "Type": "antigravity",
        "Account": "arondo@gmail.com",
        "Plan": "Google AI Pro",
        "DefaultModel": "Gemini 3.5 Flash (Medium)",
        "GeminiWeeklyRemain": 0.1,
        "GeminiWeeklyResetsAt": null,
        "GeminiHourRemain": 1.0,
        "GeminiHourResetsAt": null,
        "OtherWeeklyRemain": 0.1,
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
        "WeekRemain": 0.9,
        "WeekResetsAt": null,
        "updatedAt": Math.floor(Date.now() / 1000)
      }
    };
    await fs.writeFile(quotaPath, JSON.stringify(selectClaudeQuota, null, 2), 'utf-8');

    console.log('[automode-test] Spawning runner...');
    const result = await setupRunner(request, 'automode-test-runner', mockBinDir, {
      AGY_DIR_LOG: agyLogDir,
      CLAUDE_DIR_LOG: claudeLogDir,
    });
    const runnerProcess = result.runnerProcess;
    const runnerId = result.runnerId;

    try {
      // Step 2: Start session in "auto" mode
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

      // Verify the first run selected claude
      const msgsRes1 = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes1.status()).toBe(200);
      const messages1 = await msgsRes1.json();
      const runMsgs1 = messages1.filter((m: any) => m.type === 'agent-run');
      expect(runMsgs1.length).toBe(1);
      expect(runMsgs1[0].resolvedAgentType).toBe('claude');

      // Step 3: Write quota.json to select antigravity (antigravity has high quota, claude has low quota)
      console.log('[automode-test] Updating quota.json to select antigravity...');
      const selectAgyQuota = {
        "antigravity_arondo@gmail.com_Google AI Pro": {
          "Type": "antigravity",
          "Account": "arondo@gmail.com",
          "Plan": "Google AI Pro",
          "DefaultModel": "Gemini 3.5 Flash (Medium)",
          "GeminiWeeklyRemain": 0.9,
          "GeminiWeeklyResetsAt": null,
          "GeminiHourRemain": 1.0,
          "GeminiHourResetsAt": null,
          "OtherWeeklyRemain": 0.1,
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
          "WeekRemain": 0.1,
          "WeekResetsAt": null,
          "updatedAt": Math.floor(Date.now() / 1000)
        }
      };
      await fs.writeFile(quotaPath, JSON.stringify(selectAgyQuota, null, 2), 'utf-8');

      // Step 4: Send follow-up message to trigger agent switch and verify context handoff
      console.log('[automode-test] Sending follow-up message "what do I said before?"...');
      const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: {
          message: 'what do I said before?',
        }
      });
      expect(msgRes.status()).toBe(200);

      // Wait for follow-up run to complete
      await waitForSessionNotRunning(request, sessionId);

      // Verify that the second run selected antigravity
      const msgsRes2 = await request.get(`/api/messages?sessionId=${sessionId}`, {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      expect(msgsRes2.status()).toBe(200);
      const messages2 = await msgsRes2.json();
      const runMsgs2 = messages2.filter((m: any) => m.type === 'agent-run');
      expect(runMsgs2.length).toBe(2);
      expect(runMsgs2[1].resolvedAgentType).toBe('antigravity');

      // Assert that the context of previous conversation is prepended to the prompt
      const secondRunMsg = runMsgs2[1];
      console.log(`[automode-test] Second run prompt:\n${secondRunMsg.prompt}`);
      
      expect(secondRunMsg.prompt).toContain('[Previous conversation context from Claude Code]');
      expect(secondRunMsg.prompt).toContain('User: Hello Automode 1');
      expect(secondRunMsg.prompt).toContain('Mock claude received: Hello Automode 1');
      expect(secondRunMsg.prompt).toContain('[End of previous context]');
      expect(secondRunMsg.prompt).toContain('what do I said before?');

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
  });
});
