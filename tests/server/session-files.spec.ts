import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

test.describe('Session files and UserMessageCard attachment rendering', () => {
  const testConfigDir = process.env.ARONDO_CONFIG_DIR || path.join(os.tmpdir(), 'arondo-test-config');
  const sessionId = 'test-session-files-123';
  const sessionDir = path.join(testConfigDir, 'sessions', sessionId);
  const sessionFilesDir = path.join(sessionDir, 'files');

  test.beforeAll(async () => {
    // Create session and files directory in test config dir
    await fs.mkdir(sessionFilesDir, { recursive: true });

    // Create session.json
    const sessionData = {
      id: sessionId,
      name: 'Test File Session',
      status: 'idle',
      agentType: 'agy',
      repoPath: '/tmp/repo',
      runnerId: 'test-runner-files',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(sessionData, null, 2), 'utf-8');

    // Create a mock image file with timestamp prefix
    const dummyImageBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    await fs.writeFile(path.join(sessionFilesDir, '1728000000000_sample.png'), dummyImageBuffer);

    // Create a mock text/document file
    await fs.writeFile(path.join(sessionFilesDir, '1728000000100_document.pdf'), Buffer.from('%PDF-1.4 test document'));
  });

  test('UserMessageCard renders image directly and provides a download button', () => {
    const helperPath = path.resolve(__dirname, '../helpers/renderUserMessageCardHelper.ts');
    const output = execFileSync('npx', ['tsx', helperPath, 'image'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
    });
    const result = JSON.parse(output.trim());

    expect(result.hasUserText).toBe(true);
    expect(result.noRawClip).toBe(true);
    expect(result.hasImg).toBe(true);
    expect(result.imgSrcCorrect).toBe(true);
    expect(result.hasDownloadBtn).toBe(true);
    expect(result.downloadAttr).toBe(true);
    expect(result.downloadParam).toBe(true);
  });

  test('UserMessageCard parses attachment from content when files prop is omitted', () => {
    const helperPath = path.resolve(__dirname, '../helpers/renderUserMessageCardHelper.ts');
    const output = execFileSync('npx', ['tsx', helperPath, 'parsed'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
    });
    const result = JSON.parse(output.trim());

    expect(result.hasImg).toBe(true);
    expect(result.downloadAttr).toBe(true);
  });

  test('UserMessageCard renders file card with download button for non-image files', () => {
    const helperPath = path.resolve(__dirname, '../helpers/renderUserMessageCardHelper.ts');
    const output = execFileSync('npx', ['tsx', helperPath, 'doc'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
    });
    const result = JSON.parse(output.trim());

    expect(result.hasNoImg).toBe(true);
    expect(result.hasFileName).toBe(true);
    expect(result.hasFileSize).toBe(true);
    expect(result.hasDownloadBtn).toBe(true);
    expect(result.downloadAttr).toBe(true);
    expect(result.downloadUrlCorrect).toBe(true);
  });

  test('Server GET /api/sessions/[id]/files/[filename] requires authentication', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/files/sample.png`);
    expect(res.status()).toBe(403);
  });

  test('Server GET /api/sessions/[id]/files/[filename] serves image inline', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/files/sample.png`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    expect(res.headers()['content-disposition']).toContain('inline');
    expect(res.headers()['content-disposition']).toContain('sample.png');
  });

  test('Server GET /api/sessions/[id]/files/[filename]?download=1 serves attachment', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/files/sample.png?download=1`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    expect(res.headers()['content-disposition']).toContain('attachment');
    expect(res.headers()['content-disposition']).toContain('sample.png');
  });

  test('Server GET /api/sessions/[id]/files?file=... query route functions equivalently', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/files?file=document.pdf`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    const text = await res.text();
    expect(text).toContain('%PDF-1.4 test document');
  });

  test('Server rejects path traversal', async ({ request }) => {
    const res = await request.get(`/api/sessions/${sessionId}/files/..%2F..%2Farondo.json`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(res.status()).toBe(404);
  });
});
