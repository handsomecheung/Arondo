import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Runner integration test', () => {
  let runnerProcess: ChildProcess;

  test.beforeAll(async () => {
    // Corrected relative path since the test file is now in tests/runner/ directory
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-xyz'
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[runner stderr] ${data.toString().trim()}`);
    });
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('Go runner process stopped.');
    }
  });

  test('should register runner on server when started', async ({ request }) => {
    const maxRetries = 20;
    let registered = false;

    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: {
          'x-arondo-token': 'test-token-123456'
        }
      });
      
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'Test Runner');
        if (found) {
          registered = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(registered).toBeTruthy();
  });
});
