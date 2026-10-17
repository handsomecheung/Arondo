import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

test.describe('Runner File System API integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('[fs-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-fs'
    ], {
      stdio: 'pipe',
    });

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'Test FS Runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for FS API integration tests');
    }
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('[fs-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[fs-test] Go runner stopped.');
    }
  });

  test('should list directory contents of a valid folder', async ({ request }) => {
    // List current tests/runner folder
    const targetDir = path.resolve(__dirname);
    const response = await request.get(`/api/fs?path=${encodeURIComponent(targetDir)}&runner=${runnerId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty('currentPath');
    expect(result).toHaveProperty('entries');
    expect(Array.isArray(result.entries)).toBeTruthy();
    
    // The listed entries should contain this test file "fs.spec.ts"
    const hasThisFile = result.entries.some((entry: any) => entry.name === 'fs.spec.ts');
    expect(hasThisFile).toBeTruthy();
  });

  test('should create a directory', async ({ request }) => {
    const parentPath = path.resolve(__dirname);
    const name = `arondo-fs-test-${Date.now()}`;
    const directoryPath = path.join(parentPath, name);

    try {
      const response = await request.post('/api/fs', {
        headers: { 'x-arondo-token': 'test-token-123456' },
        data: { runnerId, parentPath, name },
      });
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.path).toBe(directoryPath);

      const listResponse = await request.get(
        `/api/fs?path=${encodeURIComponent(parentPath)}&runner=${runnerId}`,
        { headers: { 'x-arondo-token': 'test-token-123456' } },
      );
      const list = await listResponse.json();
      expect(list.directories.some((entry: any) => entry.path === directoryPath)).toBeTruthy();
    } finally {
      await import('fs/promises').then((fs) => fs.rm(directoryPath, { recursive: true, force: true }));
    }
  });

  test('should read content of a valid file', async ({ request }) => {
    const targetFile = path.resolve(__filename);
    const response = await request.get(`/api/fs/file?path=${encodeURIComponent(targetFile)}&runner=${runnerId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.path).toBe(targetFile);
    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('Runner File System API integration tests');
  });

  test('should return 404 for non-existing file read', async ({ request }) => {
    const targetFile = path.resolve(__dirname, 'non_existent_file_xyz.txt');
    const response = await request.get(`/api/fs/file?path=${encodeURIComponent(targetFile)}&runner=${runnerId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(response.status()).toBe(404);
  });
});
