import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'child_process';
import { once } from 'events';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import fs from 'fs/promises';
import { openSync, writeSync, closeSync } from 'fs';
import os from 'os';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { SERVER_VERSION } from '../../lib/version';

let buildDirectory: string;
let oldBinary: Buffer;
let newBinary: Buffer;

test.beforeAll(async () => {
  buildDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-update-build-'));
  const binary = path.join(buildDirectory, 'old-runner');
  execFileSync('go', ['build', '-ldflags', '-X main.Version=0.0.1', '-o', binary, '.'], {
    cwd: path.resolve(__dirname, '../../runner'),
  });
  oldBinary = await fs.readFile(binary);
  newBinary = await fs.readFile(path.resolve(__dirname, '../../runner/arondo-runner'));
});

test.afterAll(async () => {
  await fs.rm(buildDirectory, { recursive: true, force: true });
});

async function scenario(body = newBinary, status = 200, tokenFlag = true, autoUpdate: boolean | null = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-auto-update-'));
  const binary = path.join(directory, 'runner');
  const logFile = path.join(directory, 'runner.log');
  await fs.writeFile(binary, oldBinary, { mode: 0o755 });
  const downloads: { token?: string }[] = [];
  const server = createServer((request, response) => {
    downloads.push({ token: request.headers['x-runner-token'] as string | undefined });
    response.writeHead(status, { 'Content-Type': 'application/octet-stream' });
    response.end(body);
  });
  const sockets = new WebSocketServer({ noServer: true });
  const token = 'auto-update-test-token';
  server.on('upgrade', (request, socket, head) => {
    if (request.headers['x-runner-token'] !== token) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, connection => sockets.emit('connection', connection));
  });
  const messages: any[] = [];
  const registrations: string[] = [];
  let current: WebSocket;
  let connections = 0;
  sockets.on('connection', socket => {
    connections++;
    socket.on('message', data => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      if (message.method === 'register') {
        registrations.push(message.payload.version);
        current = socket;
        socket.send(JSON.stringify({ id: 'connected', type: 'event', method: 'connected', payload: { queryAgents: [] } }));
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  const args = ['--server', `ws://${address}/runner`];
  if (autoUpdate !== null) args.push(`--auto-update=${autoUpdate}`);
  if (tokenFlag) args.push('--token', token);
  const descriptor = openSync(logFile, 'w');
  writeSync(descriptor, 'original log marker\n');
  const process = spawn(binary, args, {
    env: { ...global.process.env, ARONDO_RUNNER_TOKEN: tokenFlag ? 'wrong-environment-token' : token },
    stdio: ['ignore', descriptor, descriptor],
  });
  closeSync(descriptor);
  let counter = 0;
  const readLog = () => fs.readFile(logFile, 'utf8');
  async function request(method: string, payload: unknown) {
    const id = `test-${++counter}`;
    current.send(JSON.stringify({ id, type: 'request', method, payload }));
    await expect.poll(() => messages.find(message => message.id === id && message.type === 'response')).toBeTruthy();
    return messages.find(message => message.id === id && message.type === 'response').payload;
  }
  return {
    process, binary, directory, registrations, downloads, messages, readLog,
    connections: () => connections,
    async start() {
      await expect.poll(() => registrations).toEqual(['0.0.1']);
    },
    request,
    update: () => request('runner.update', { version: SERVER_VERSION, downloadUrl: `http://${address}/download` }),
    async close() {
      if (process.exitCode === null && process.signalCode === null) {
        const exited = once(process, 'exit');
        process.kill('SIGTERM');
        await exited;
      }
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>(resolve => sockets.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

for (const explicitFalse of [false, true]) {
  test(`logs an update without downloading when auto-update is ${explicitFalse ? 'explicitly false' : 'omitted'}`, async () => {
    const runner = await scenario(newBinary, 200, true, explicitFalse ? false : null);
    try {
      await runner.start();
      expect(await runner.update()).toMatchObject({ ok: true });
      await expect.poll(runner.readLog).toContain('automatic updates disabled; enable with --auto-update=true');
      expect(await runner.readLog()).toContain(`runner update available (v${SERVER_VERSION})`);
      expect(await runner.readLog()).toContain('/download');
      expect(runner.downloads).toEqual([]);
      expect(runner.registrations).toEqual(['0.0.1']);
      expect(await fs.readFile(runner.binary)).toEqual(oldBinary);
      expect(runner.process.exitCode).toBeNull();
      expect((await runner.request('fs.list', { path: runner.directory })).ok).toBe(true);
    } finally {
      await runner.close();
    }
  });
}

for (const tokenFlag of [true, false]) {
  test(`exec preserves PID, arguments, ${tokenFlag ? 'token flag' : 'environment token'}, and redirected logs`, async () => {
    const runner = await scenario(newBinary, 200, tokenFlag);
    try {
      await runner.start();
      const pid = runner.process.pid;
      expect(await runner.update()).toMatchObject({ ok: true });
      await expect.poll(() => runner.registrations).toEqual(['0.0.1', SERVER_VERSION]);
      expect(runner.process.pid).toBe(pid);
      expect(runner.process.exitCode).toBeNull();
      expect(runner.connections()).toBe(3);
      expect(runner.downloads).toEqual([{ token: undefined }]);
      expect(await fs.readFile(runner.binary)).toEqual(newBinary);
      expect(await fs.readFile(runner.binary + '.previous')).toEqual(oldBinary);
      const log = await runner.readLog();
      expect(log).toContain('original log marker');
      expect(log).toContain('connection check succeeded');
      expect(log).toContain(`switching to runner ${SERVER_VERSION}`);
      expect(log.match(/starting runner,/g)).toHaveLength(2);
      const result = await runner.request('fs.list', { path: runner.directory });
      expect(result.ok).toBe(true);
    } finally {
      await runner.close();
    }
  });
}

test('waits for scripts, permits work while waiting, and reports exits before replacing the runner', async () => {
  const runner = await scenario();
  try {
    await runner.start();
    expect(await runner.request('exec.script', {
      taskId: 'blocking-script', command: 'read line; echo finished', workDir: runner.directory,
    })).toMatchObject({ ok: true });
    await runner.update();
    await expect.poll(runner.readLog).toContain('passed preflight; waiting for all tasks to finish');
    expect(runner.registrations).toEqual(['0.0.1']);
    expect(await fs.readFile(runner.binary)).toEqual(oldBinary);
    expect(await runner.request('exec.script', {
      taskId: 'additional-script', command: 'echo additional-work', workDir: runner.directory,
    })).toMatchObject({ ok: true });
    await expect.poll(() => runner.messages.find(message => message.method === 'exec.exit' && message.payload.taskId === 'additional-script')).toBeTruthy();
    await runner.request('pty.input', { taskId: 'blocking-script', data: 'finish\n' });
    await expect.poll(() => runner.registrations).toEqual(['0.0.1', SERVER_VERSION]);
    const exit = runner.messages.findIndex(message => message.method === 'exec.exit' && message.payload.taskId === 'blocking-script');
    const registration = runner.messages.findIndex(message => message.method === 'register' && message.payload.version === SERVER_VERSION);
    expect(exit).toBeGreaterThan(-1);
    expect(exit).toBeLessThan(registration);
    expect(runner.process.exitCode).toBeNull();
  } finally {
    await runner.close();
  }
});

test('restores the old executable and resumes task admission when exec fails', async () => {
  const runner = await scenario();
  try {
    await runner.start();
    await runner.request('exec.script', { taskId: 'hold', command: 'read line', workDir: runner.directory });
    await runner.update();
    await expect.poll(runner.readLog).toContain('passed preflight; waiting for all tasks to finish');
    const temporary = (await fs.readdir(runner.directory)).find(name => name.startsWith('.arondo-runner-update-'));
    expect(temporary).toBeDefined();
    await fs.chmod(path.join(runner.directory, temporary!), 0o644);
    await runner.request('pty.input', { taskId: 'hold', data: 'finish\n' });
    await expect.poll(runner.readLog).toContain('exec failed; old binary restored');
    expect(await fs.readFile(runner.binary)).toEqual(oldBinary);
    expect(runner.registrations).toEqual(['0.0.1']);
    expect(runner.process.exitCode).toBeNull();
    expect(await runner.request('exec.script', {
      taskId: 'after-failure', command: 'echo still-running', workDir: runner.directory,
    })).toMatchObject({ ok: true });
    await expect.poll(() => runner.messages.find(message => message.method === 'exec.exit' && message.payload.taskId === 'after-failure')).toBeTruthy();
  } finally {
    await runner.close();
  }
});

for (const failure of ['http-error', 'invalid-binary', 'wrong-version', 'failed-check']) {
  test(`keeps the old runner connected after ${failure}`, async () => {
    let body: Buffer = newBinary;
    let status = 200;
    if (failure === 'http-error') status = 404;
    if (failure === 'invalid-binary') body = Buffer.from('invalid executable');
    if (failure === 'wrong-version') body = oldBinary;
    if (failure === 'failed-check') body = Buffer.from(`#!/usr/bin/env bash\nif [ "$1" = --version ]; then echo ${SERVER_VERSION}; exit 0; fi\nexit 1\n`);
    const runner = await scenario(body, status);
    try {
      await runner.start();
      await runner.update();
      await expect.poll(runner.readLog).toContain('failed; keeping current runner');
      expect(runner.registrations).toEqual(['0.0.1']);
      expect(runner.process.exitCode).toBeNull();
      expect(await fs.readFile(runner.binary)).toEqual(oldBinary);
      expect((await fs.readdir(runner.directory)).filter(name => name.startsWith('.arondo-runner-'))).toEqual([]);
      expect((await runner.request('fs.list', { path: runner.directory })).ok).toBe(true);
    } finally {
      await runner.close();
    }
  });
}
