import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

// A single-use (once) session accepts exactly one prompt, so the Session Page
// chat input must be disabled and must explain why in its placeholder.
const EXPECTED_PLACEHOLDER = 'This is a single-use session. Chat is disabled.';

function renderChatInput(scenario: 'temp-dir-once' | 'no-path-once') {
  const scriptPath = path.resolve(__dirname, 'helpers/renderOnceSessionInputHelper.ts');
  const output = execFileSync('npx', ['tsx', scriptPath, scenario], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
  });
  return JSON.parse(output.trim().split('\n').pop() as string) as {
    found: boolean;
    disabled: boolean;
    placeholder: string | null;
  };
}

test.describe('Once session chat input', () => {
  test('--temp-dir --once: chat input is disabled with a single-use reason', () => {
    const result = renderChatInput('temp-dir-once');
    expect(result.found).toBe(true);
    expect(result.disabled).toBe(true);
    expect(result.placeholder).toBe(EXPECTED_PLACEHOLDER);
  });

  // Note: the CLI/API reject --no-path with --once, so this state is built
  // directly as { noProject: true, once: true } as it would appear in session.json.
  test('--no-path --once: chat input is disabled with a single-use reason', () => {
    const result = renderChatInput('no-path-once');
    expect(result.found).toBe(true);
    expect(result.disabled).toBe(true);
    expect(result.placeholder).toBe(EXPECTED_PLACEHOLDER);
  });
});
