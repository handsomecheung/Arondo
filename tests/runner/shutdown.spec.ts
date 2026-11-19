import { test, expect, type APIRequestContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { once } from 'events';
import path from 'path';

const headers = { 'x-arondo-token': 'test-token-123456' };

test.describe('Runner shutdown', () => {
  const processes: ChildProcess[] = [];
  const tokenIds: string[] = [];

  async function createToken(request: APIRequestContext) {
    const response = await request.post('/api/auth/runner-tokens', {
      headers,
      data: { name: `Shutdown test ${randomUUID()}` },
    });
    expect(response.ok()).toBeTruthy();
    const token = await response.json();
    tokenIds.push(token.id);
    return token.token as string;
  }

  async function startRunner(token: string) {
    const process = spawn(path.resolve(__dirname, '../../runner/arondo-runner'), [
      '--server', 'ws://localhost:3252/runner', '--token', token,
    ], { stdio: 'pipe' });
    processes.push(process);
    let output = '';
    process.stdout!.on('data', data => { output += data.toString(); });
    process.stderr!.on('data', data => { output += data.toString(); });
    await expect.poll(() => output).toContain('server acknowledged connection');
    return { process, output: () => output };
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

  test('replaces only the runner using the same token and logs the reason', async ({ request }) => {
    const token = await createToken(request);
    const first = await startRunner(token);
    const unrelated = await startRunner(await createToken(request));
    const replacement = await startRunner(token);

    await expect.poll(() => first.process.exitCode).toBe(0);
    expect(first.output()).toContain('shutdown requested: Another runner connected with the same token.');
    expect(first.output()).not.toContain('reconnecting in');
    expect(replacement.process.exitCode).toBeNull();
    expect(unrelated.process.exitCode).toBeNull();

    const response = await request.get('/api/runners', { headers });
    expect(response.ok()).toBeTruthy();
    const runners = await response.json();
    for (const tokenId of tokenIds) {
      expect(runners.filter((runner: any) => runner.runnerTokenId === tokenId && runner.connected)).toHaveLength(1);
    }

    // A third registration must retire the replacement, not the original connection.
    const latest = await startRunner(token);
    await expect.poll(() => replacement.process.exitCode).toBe(0);
    expect(replacement.output()).toContain('Another runner connected with the same token.');
    expect(latest.process.exitCode).toBeNull();
    expect(unrelated.process.exitCode).toBeNull();
  });

  test('administrator disconnect logs its reason and exits', async ({ request }) => {
    const runner = await startRunner(await createToken(request));
    const response = await request.get('/api/runners', { headers });
    expect(response.ok()).toBeTruthy();
    const runners = await response.json();
    const registered = runners.find((entry: any) => entry.runnerTokenId === tokenIds[0] && entry.connected);
    expect(registered).toBeDefined();

    const disconnected = await request.post('/api/runners', {
      headers,
      data: { id: registered.id, disconnect: true },
    });
    expect(disconnected.ok()).toBeTruthy();
    await expect.poll(() => runner.process.exitCode).toBe(0);
    expect(runner.output()).toContain('shutdown requested: Disconnected by an administrator.');
    expect(runner.output()).not.toContain('reconnecting in');
    await expect.poll(async () => {
      const current = await request.get('/api/runners', { headers });
      const entries = await current.json();
      return entries.find((entry: any) => entry.id === registered.id)?.connected;
    }).toBe(false);
  });
});
