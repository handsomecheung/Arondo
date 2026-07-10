import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { addMessage, updateMessage, getMessages } from '../../lib/store';
import { withFileLock, writeJsonAtomic } from '../../lib/fileLock';

// Regression tests for the messages.json corruption bug: concurrent
// read-modify-write calls against the same project's (sessionless)
// messages.json used to interleave and either drop messages or leave the
// file with trailing garbage that failed JSON.parse.
test.describe('store.ts message concurrency', () => {
  test('concurrent addMessage calls on the same project do not corrupt or drop messages', async () => {
    const projectId = crypto.randomUUID();
    const total = 40;

    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        addMessage({
          sessionId: '',
          projectId,
          role: 'system',
          content: `message-${i}`,
        })
      )
    );

    const all = await getMessages('', projectId);
    expect(all.length).toBe(total);
    const contents = new Set(all.map((m) => m.content));
    expect(contents.size).toBe(total);
  });

  test('interleaved addMessage + updateMessage on the same project stays consistent', async () => {
    const projectId = crypto.randomUUID();

    // Mirrors the real race: registerTask() awaits updateMessage() while
    // updateTaskPid() fires a second updateMessage() without awaiting it,
    // both targeting the same messages.json around the same time.
    const seeded = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        addMessage({
          sessionId: '',
          projectId,
          role: 'system',
          content: `task-${i}`,
        })
      )
    );

    await Promise.all(
      seeded.map((msg, i) =>
        updateMessage('', msg.id, { taskId: `task-id-${i}`, pid: 1000 + i }, projectId)
      )
    );

    const all = await getMessages('', projectId);
    expect(all.length).toBe(seeded.length);
    for (let i = 0; i < all.length; i++) {
      const msg = all.find((m) => m.content === `task-${i}`);
      expect(msg).toBeDefined();
      expect(msg!.taskId).toBe(`task-id-${i}`);
      expect(msg!.pid).toBe(1000 + i);
    }
  });
});

test.describe('fileLock utility', () => {
  test('withFileLock serializes concurrent read-modify-write so no increments are lost', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-filelock-'));
    const filePath = path.join(dir, 'counter.json');
    await writeJsonAtomic(filePath, { count: 0 });

    const increments = 50;
    await Promise.all(
      Array.from({ length: increments }, () =>
        withFileLock(filePath, async () => {
          const raw = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(raw);
          data.count += 1;
          await writeJsonAtomic(filePath, data);
        })
      )
    );

    const final = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(final.count).toBe(increments);

    await fs.rm(dir, { recursive: true, force: true });
  });

  test('writeJsonAtomic never leaves a torn/partial file under concurrent writers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-atomic-'));
    const filePath = path.join(dir, 'data.json');

    // Alternate large/small payloads so a non-atomic writer (truncate then
    // write, no lock) would likely interleave two writes and leave trailing
    // bytes behind — the exact "Unexpected non-whitespace character after
    // JSON" corruption originally observed in project messages.json.
    const large = { blob: 'x'.repeat(200_000) };
    const small = { blob: 'y' };

    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        writeJsonAtomic(filePath, i % 2 === 0 ? large : small)
      )
    );

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();

    await fs.rm(dir, { recursive: true, force: true });
  });
});
