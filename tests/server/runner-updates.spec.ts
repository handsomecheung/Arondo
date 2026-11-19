import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync, spawn } from 'child_process';
import { once } from 'events';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';
import { DEFAULT_RUNNER_DOWNLOAD_URL, getRunnerDownloadUrlError } from '../../lib/runner-update-settings';
import { getRunnerUpdate } from '../../lib/runner-updates';
import { SERVER_VERSION } from '../../lib/version';

const headers = { 'x-arondo-token': 'test-token-123456' };

test('compares semantic versions and resolves platform and repeated URL variables', () => {
  const runner = { version: '0.3.9', os: 'darwin', arch: 'arm64' };
  expect(getRunnerUpdate(runner, '0.3.19')).toEqual({
    version: '0.3.19',
    downloadUrl: 'https://github.com/handsomecheung/Arondo/releases/download/v0.3.19/arondo-runner-macos-arm64',
  });
  expect(getRunnerUpdate(runner, 'v0.3.19', 'https://mirror.example/${version}/${os}/${arch}?v=${version}')).toEqual({
    version: '0.3.19',
    downloadUrl: 'https://mirror.example/0.3.19/macos/arm64?v=0.3.19',
  });
  expect(getRunnerUpdate({ ...runner, os: 'linux', arch: 'amd64' }, '0.3.19')?.downloadUrl)
    .toContain('arondo-runner-linux-amd64');
  expect(getRunnerUpdate({ ...runner, version: '1.0.0-rc.2' }, '1.0.0-rc.10')).not.toBeNull();
  expect(getRunnerUpdate({ ...runner, version: '1.0.0-rc.10' }, '1.0.0')).not.toBeNull();
  expect(getRunnerUpdate(runner, '0.3.19+build.7')).toEqual({
    version: '0.3.19+build.7',
    downloadUrl: 'https://github.com/handsomecheung/Arondo/releases/download/v0.3.19%2Bbuild.7/arondo-runner-macos-arm64',
  });
  for (const version of ['0.3.19', '0.4.0', '0.3.19+build.1', '', 'invalid']) {
    expect(getRunnerUpdate({ ...runner, version }, '0.3.19')).toBeNull();
  }
  expect(getRunnerUpdate(runner, 'unknown')).toBeNull();
  expect(getRunnerUpdate({ version: '0.0.1' }, '0.3.19')).toBeNull();
});

test('validates URL templates without fetching the URL', () => {
  expect(getRunnerDownloadUrlError(DEFAULT_RUNNER_DOWNLOAD_URL)).toBeUndefined();
  expect(getRunnerDownloadUrlError('https://mirror.example/runner')).toBeUndefined();
  for (const value of [null, 123, '', ' ', '/runner/${os}', 'http:mirror.example', 'file:///tmp/runner', 'https://mirror.example/${platform}']) {
    expect(getRunnerDownloadUrlError(value)).toBeDefined();
  }
});

test.describe('Runner update settings and instructions', () => {
  let originalTemplate: string;
  const tokenIds: string[] = [];
  const sockets: WebSocket[] = [];

  test.beforeEach(async ({ request }) => {
    const response = await request.get('/api/settings', { headers });
    expect(response.ok()).toBeTruthy();
    originalTemplate = (await response.json()).runnerDownloadUrl;
  });

  test.afterEach(async ({ request }) => {
    for (const socket of sockets.splice(0)) socket.close();
    for (const id of tokenIds.splice(0)) {
      await request.delete(`/api/auth/runner-tokens?id=${id}`, { headers });
    }
    const response = await request.post('/api/settings', {
      headers,
      data: { runnerDownloadUrl: originalTemplate },
    });
    expect(response.ok()).toBeTruthy();
  });

  async function createToken(request: APIRequestContext) {
    const response = await request.post('/api/auth/runner-tokens', {
      headers,
      data: { name: 'Runner update test' },
    });
    expect(response.ok()).toBeTruthy();
    const token = await response.json();
    tokenIds.push(token.id);
    return token.token as string;
  }

  async function register(request: APIRequestContext, version: string) {
    const socket = new WebSocket('ws://localhost:3252/runner', {
      headers: { 'x-runner-token': await createToken(request) },
    });
    sockets.push(socket);
    const messages: any[] = [];
    socket.on('message', data => messages.push(JSON.parse(data.toString())));
    await once(socket, 'open');
    socket.send(JSON.stringify({
      id: 'register', type: 'event', method: 'register',
      payload: { hostname: 'update-test', version, os: 'darwin', arch: 'arm64', agents: [], capabilities: [] },
    }));
    await expect.poll(() => messages.find(message => message.method === 'connected')).toBeTruthy();
    return { socket, messages };
  }

  test('defaults to GitHub and persists an administrator URL edit', async ({ request }) => {
    expect(originalTemplate).toBe(DEFAULT_RUNNER_DOWNLOAD_URL);
    const runnerDownloadUrl = 'https://mirror.example/v${version}/${os}/${arch}';
    const saved = await request.post('/api/settings', {
      headers,
      data: { runnerDownloadUrl: `  ${runnerDownloadUrl}  ` },
    });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).runnerDownloadUrl).toBe(runnerDownloadUrl);
    const read = await request.get('/api/settings', { headers });
    expect((await read.json()).runnerDownloadUrl).toBe(runnerDownloadUrl);
  });

  test('rejects invalid templates and non-admin changes without modifying settings', async ({ request }) => {
    for (const runnerDownloadUrl of ['', null, 42, '/runner', 'javascript:alert(1)', 'https://mirror.example/${unknown}']) {
      const response = await request.post('/api/settings', { headers, data: { runnerDownloadUrl } });
      expect(response.status()).toBe(400);
    }
    const response = await request.post('/api/settings', {
      headers: { 'x-arondo-token': 'test-user-token-7890' },
      data: { runnerDownloadUrl: 'https://mirror.example/${version}/${os}/${arch}' },
    });
    expect(response.status()).toBe(403);
    const read = await request.get('/api/settings', { headers });
    expect((await read.json()).runnerDownloadUrl).toBe(originalTemplate);
  });

  test('sends the server version and a resolved custom URL to an older runner', async ({ request }) => {
    const saved = await request.post('/api/settings', {
      headers,
      data: { runnerDownloadUrl: 'https://mirror.example/${os}/${arch}/v${version}' },
    });
    expect(saved.ok()).toBeTruthy();
    const { messages } = await register(request, '0.0.1');
    await expect.poll(() => messages.find(message => message.method === 'runner.update')).toMatchObject({
      type: 'request',
      payload: { version: SERVER_VERSION, downloadUrl: `https://mirror.example/macos/arm64/v${SERVER_VERSION}` },
    });
    expect(messages.find(message => message.method === 'connected').payload.serverVersion).toBe(SERVER_VERSION);
  });

  test('does not notify matching, newer, or invalid runner versions', async ({ request }) => {
    const connections = await Promise.all([SERVER_VERSION, '999.0.0', 'invalid'].map(version => register(request, version)));
    const older = await register(request, '0.0.1');
    await expect.poll(() => older.messages.some(message => message.method === 'runner.update')).toBe(true);
    for (const { socket, messages } of connections) {
      const pong = once(socket, 'pong');
      socket.ping();
      await pong;
      expect(messages.some(message => message.method === 'runner.update')).toBe(false);
    }
  });

  test('the Go runner keeps its connection when the update download fails', async ({ request }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-update-notice-'));
    const binary = path.join(directory, 'arondo-runner');
    const downloadServer = createServer((_, response) => { response.writeHead(404); response.end(); });
    downloadServer.listen(0, '127.0.0.1');
    await once(downloadServer, 'listening');
    try {
      const downloadUrl = `http://127.0.0.1:${(downloadServer.address() as AddressInfo).port}/missing-runner`;
      const saved = await request.post('/api/settings', { headers, data: { runnerDownloadUrl: downloadUrl } });
      expect(saved.ok()).toBeTruthy();
      execFileSync('go', ['build', '-ldflags', '-X main.Version=0.0.1', '-o', binary, '.'], {
        cwd: path.resolve(__dirname, '../../runner'),
      });
      const process = spawn(binary, [
        '--server', 'ws://localhost:3252/runner', '--token', await createToken(request), '--auto-update=true',
      ], { stdio: 'pipe' });
      let output = '';
      process.stderr!.on('data', data => { output += data.toString(); });
      try {
        await expect.poll(() => output).toContain('failed; keeping current runner');
        expect(output).toContain(downloadUrl);
        expect(output).toContain('HTTP 404');
        expect(output).not.toMatch(/\$\{(version|os|arch)\}/);
        expect(process.exitCode).toBeNull();
        const read = await request.get('/api/runners', { headers });
        const runner = (await read.json()).find((entry: any) => entry.runnerTokenId === tokenIds[0]);
        expect(runner).toMatchObject({ version: '0.0.1', connected: true });
      } finally {
        if (process.exitCode === null && process.signalCode === null) {
          const exited = once(process, 'exit');
          process.kill('SIGTERM');
          await exited;
        }
      }
    } finally {
      await new Promise<void>(resolve => downloadServer.close(() => resolve()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
