import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export async function waitForSessionNotRunning(request: any, sessionId: string) {
  const maxRetries = 50;
  for (let i = 0; i < maxRetries; i++) {
    const res = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    if (res.ok()) {
      const sessions = await res.json();
      const session = sessions.find((s: any) => s.id === sessionId);
      if (session && session.status !== 'running') {
        return session;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Session ${sessionId} timed out waiting to exit running state`);
}

export async function setupRunner(request: any, name: string, mockBinDir: string, extraEnv?: Record<string, string>) {
  const runnerBinary = path.resolve(__dirname, '../../../runner/arondo-runner');
  
  console.log(`[resume-test] Spawning Go runner process for ${name}...`);
  const runnerProcess = spawn(runnerBinary, [
    '--server', 'ws://localhost:3252/runner',
    '--name', name,
    '--token', 'test-runner-token-xyz'
  ], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${process.env.PATH}`,
      ...extraEnv,
    }
  });

  runnerProcess.stdout?.on('data', (data) => {
    console.log(`[${name} stdout] ${data.toString().trim()}`);
  });
  runnerProcess.stderr?.on('data', (data) => {
    console.error(`[${name} stderr] ${data.toString().trim()}`);
  });

  let runnerId = '';
  const maxRetries = 20;
  for (let i = 0; i < maxRetries; i++) {
    const response = await request.get('/api/runners', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    if (response.ok()) {
      const list = await response.json();
      const found = list.find((r: any) => r.name === name);
      if (found) {
        runnerId = found.id;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!runnerId) {
    runnerProcess.kill('SIGKILL');
    throw new Error(`Failed to register runner ${name}`);
  }
  
  return { runnerProcess, runnerId };
}

export async function teardownRunner(runnerProcess: ChildProcess) {
  if (runnerProcess) {
    console.log('[resume-test] Stopping Go runner process...');
    runnerProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      runnerProcess.on('exit', () => resolve());
    });
    console.log('[resume-test] Go runner stopped.');
  }
}
