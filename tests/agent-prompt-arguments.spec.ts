import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { BaseAgent } from '../lib/agents/base';
import { ClaudeCodeAgent } from '../lib/agents/claude';
import { CodexAgent, saveCodexSessionId } from '../lib/agents/codex';
import { OpencodeAgent, saveOpencodeSessionId } from '../lib/agents/opencode';

let tempDir: string;
const agents: BaseAgent[] = [new ClaudeCodeAgent(), new CodexAgent(), new OpencodeAgent()];
const sessionId = '019f9883-1234-5678-9abc-def012345678';
const codexId = '019f9883-1234-5678-9abc-def012345679';
const opencodeId = 'ses_prompt_arguments';

test.beforeAll(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'arondo-prompt-arguments-'));
  await saveCodexSessionId(sessionId, codexId);
  await saveOpencodeSessionId(sessionId, opencodeId);
});

test.afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

for (const isResume of [false, true]) {
  for (const prompt of ['--hi', '--help', '--', '-p', 'ordinary message', '--hi "quoted"\n$(echo injected); `echo injected`']) {
    test(`${isResume ? 'resumed' : 'fresh'} agents preserve prompt ${JSON.stringify(prompt)}`, () => {
      const promptFile = path.join(tempDir, 'prompt.txt');
      writeFileSync(promptFile, prompt);

      for (const agent of agents) {
        const command = agent.getCommand({ prompt, repoPath: tempDir, sessionId, isResume, model: 'test-model' });
        const output = execFileSync('bash', ['-c', `${agent.name}() { printf '%s\\0' "$@"; }; ${command}`], {
          env: { ...process.env, ARONDO_PROMPT_FILE: promptFile },
        });
        const args = output.toString().split('\0').slice(0, -1);
        const { values, positionals } = parseArgs({
          args,
          allowPositionals: true,
          options: {
            print: { type: 'boolean' },
            allowedTools: { type: 'string' },
            'dangerously-skip-permissions': { type: 'boolean' },
            'dangerously-bypass-approvals-and-sandbox': { type: 'boolean' },
            'session-id': { type: 'string' },
            resume: { type: 'string' },
            session: { type: 'string' },
            title: { type: 'string' },
            model: { type: 'string' },
          },
        });

        expect(positionals.at(-1), agent.name).toBe(prompt);
        expect(values.model, agent.name).toBe('test-model');
        if (agent.name === 'claude') {
          expect(positionals).toEqual([prompt]);
          expect(values.print).toBe(true);
          expect(values[isResume ? 'resume' : 'session-id']).toBe(sessionId);
        } else if (agent.name === 'codex') {
          expect(positionals).toEqual(isResume ? ['exec', 'resume', codexId, prompt] : ['exec', prompt]);
        } else {
          expect(positionals).toEqual(['run', prompt]);
          expect(isResume ? values.session : values.title).toBe(isResume ? opencodeId : `arondo-${sessionId}`);
        }
      }
    });
  }
}
