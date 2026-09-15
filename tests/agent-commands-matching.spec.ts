import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import { resolveAgentCommand, AGENT_COMMANDS } from '../lib/agentCommands';

test.describe('AgentCommand matching and UI rendering tests', () => {
  test('resolveAgentCommand should return null for non-command messages starting with a slash (e.g. URL paths)', () => {
    // URL path messages should not match any built-in agent command
    expect(resolveAgentCommand('/user/id', AGENT_COMMANDS)).toBeNull();
    expect(resolveAgentCommand('/api/v1/users', AGENT_COMMANDS)).toBeNull();
    expect(resolveAgentCommand('/var/log/nginx/access.log', AGENT_COMMANDS)).toBeNull();
  });

  // Bug reproduction test in SessionView UI:
  // When a user sends a message like "/user/id", resolveAgentCommand correctly returns null.
  // However, SessionView naively checks `if (msg.role === "user" && msg.content.startsWith("/"))`
  // and renders it as UserAgentCommandCard (<div className="... user-agent-command-card ...">)
  // instead of UserMessageCard (<div className="... user-message-card ...">).
  test('SessionView UI should render plain UserMessageCard and NOT UserAgentCommandCard for URL path message /user/id', () => {
    const scriptPath = path.resolve(__dirname, 'helpers/renderSessionViewHelper.ts');
    
    // Execute helper via tsx to evaluate actual SessionView component rendering
    const output = execFileSync('npx', ['tsx', scriptPath], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    });

    const result = JSON.parse(output.trim());

    // Expectation:
    // 1. Must render UserMessageCard (.user-message-card)
    // 2. Must NOT render UserAgentCommandCard (.user-agent-command-card)
    //
    // Currently, this FAILS because SessionView renders UserAgentCommandCard for any slash-prefixed text.
    expect(result.hasUserMessageCard).toBe(true);
    expect(result.hasUserAgentCommandCard).toBe(false);
  });
});
