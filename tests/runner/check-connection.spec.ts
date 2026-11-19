import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import path from 'path';

const binary = path.resolve(__dirname, '../../runner/arondo-runner');
const serverURL = 'ws://localhost:3252/runner';
const headers = { 'x-arondo-token': 'test-token-123456' };

function runCheck(token?: string, envToken = '') {
  const args = ['--server', serverURL, '--check-connection'];
  if (token !== undefined) args.push('--token', token);
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    execFile(binary, args, {
      timeout: 15_000,
      env: { ...process.env, ARONDO_RUNNER_TOKEN: envToken },
    }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== 'number' || error.killed)) {
        reject(error);
        return;
      }
      resolve({ code: typeof error?.code === 'number' ? error.code : 0, output: stdout + stderr });
    });
  });
}

test.describe('Runner connection check', () => {
  const tokenIds: string[] = [];
  const processes: ChildProcess[] = [];

  async function createToken(request: APIRequestContext) {
    const response = await request.post('/api/auth/runner-tokens', {
      headers,
      data: { name: 'Connection check test' },
    });
    expect(response.ok()).toBeTruthy();
    const token = await response.json();
    tokenIds.push(token.id);
    return token as { id: string; token: string };
  }

  test.afterEach(async ({ request }) => {
    await Promise.all(processes.splice(0).map(async process => {
      if (process.exitCode !== null || process.signalCode !== null) return;
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    }));
    for (const id of tokenIds.splice(0)) {
      await request.delete(`/api/auth/runner-tokens?id=${id}`, { headers });
    }
  });

  test('checks authentication and ping/pong without registering or binding the token', async ({ request }) => {
    const token = await createToken(request);
    const result = await runCheck(token.token, 'invalid-environment-token');
    expect(result.code).toBe(0);
    expect(result.output).toContain('connection check succeeded');
    expect(result.output).not.toContain('starting runner');
    expect(result.output).not.toContain('server acknowledged connection');
    expect(result.output).not.toContain('reconnecting in');
    expect(result.output).not.toContain(token.token);

    const tokensResponse = await request.get('/api/auth/runner-tokens', { headers });
    expect(tokensResponse.ok()).toBeTruthy();
    const stored = (await tokensResponse.json()).find((entry: any) => entry.id === token.id);
    expect(stored.boundRunnerId).toBeNull();
    const runnersResponse = await request.get('/api/runners', { headers });
    expect(runnersResponse.ok()).toBeTruthy();
    expect((await runnersResponse.json()).some((entry: any) => entry.runnerTokenId === token.id)).toBe(false);
  });

  test('accepts ARONDO_RUNNER_TOKEN when --token is absent', async ({ request }) => {
    const token = await createToken(request);
    const result = await runCheck(undefined, token.token);
    expect(result.code).toBe(0);
    expect(result.output).toContain('connection check succeeded');
  });

  test('leaves the runner already using the same token connected', async ({ request }) => {
    const token = await createToken(request);
    const active = spawn(binary, ['--server', serverURL, '--token', token.token], { stdio: 'pipe' });
    processes.push(active);
    let output = '';
    active.stderr!.on('data', data => { output += data.toString(); });
    await expect.poll(() => output).toContain('server acknowledged connection');
    const beforeResponse = await request.get('/api/runners', { headers });
    const before = (await beforeResponse.json()).find((entry: any) => entry.runnerTokenId === token.id);
    expect(before.connectedAt).toEqual(expect.any(Number));

    const result = await runCheck(token.token);
    expect(result.code).toBe(0);
    expect(result.output).toContain('connection check succeeded');
    const afterResponse = await request.get('/api/runners', { headers });
    const after = (await afterResponse.json()).find((entry: any) => entry.runnerTokenId === token.id);
    expect(after).toMatchObject({ id: before.id, connectedAt: before.connectedAt, connected: true });
    expect(active.exitCode).toBeNull();
    expect(output).not.toContain('shutdown requested');
  });

  for (const token of ['', 'invalid-runner-token']) {
    test(`fails once for a ${token ? 'rejected' : 'missing'} token`, async () => {
      const result = await runCheck(token);
      expect(result.code).toBe(1);
      expect(result.output).toContain('connection check failed');
      expect(result.output).toContain('HTTP 401');
      expect(result.output).not.toContain('connection check succeeded');
      expect(result.output).not.toContain('reconnecting in');
    });
  }
});
