import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

test.describe('Sessions API integration tests', () => {
  let runnerProcess: ChildProcess;
  let runnerId: string;

  test.beforeAll(async ({ request }) => {
    const runnerBinary = path.resolve(__dirname, '../../runner/arondo-runner');
    
    console.log('[sessions-test] Spawning Go runner process...');
    runnerProcess = spawn(runnerBinary, [
      '--server', 'ws://localhost:3252/runner',
      '--token', 'test-runner-token-sessions'
    ], {
      stdio: 'pipe',
    });

    runnerProcess.stdout?.on('data', (data) => {
      console.log(`[sessions-runner stdout] ${data.toString().trim()}`);
    });
    runnerProcess.stderr?.on('data', (data) => {
      console.error(`[sessions-runner stderr] ${data.toString().trim()}`);
    });

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      const response = await request.get('/api/runners', {
        headers: { 'x-arondo-token': 'test-token-123456' }
      });
      if (response.ok()) {
        const list = await response.json();
        const found = list.find((r: any) => r.name === 'Test Sessions Runner');
        if (found) {
          runnerId = found.id;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!runnerId) {
      throw new Error('Failed to register runner for sessions API integration tests');
    }
    console.log(`[sessions-test] Registered runner ID: ${runnerId}`);
  });

  test.afterAll(async () => {
    if (runnerProcess) {
      console.log('[sessions-test] Stopping Go runner process...');
      runnerProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        runnerProcess.on('exit', () => resolve());
      });
      console.log('[sessions-test] Go runner stopped.');
    }
  });

  test('should fail to create session with missing payload parameters', async ({ request }) => {
    const response = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        repoPath: '/tmp/test-repo'
        // missing runnerId
      }
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('runnerId is required');
  });

  test('resolves CLI-style agent commands for drafts and follow-ups', async ({ request }) => {
    const headers = { 'x-arondo-token': 'test-token-123456' };
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-cli-command-'));
    const command = `cli-${Date.now()}`;
    const matcher = `^${command}\\s+(.+)$`;
    const sessions: string[] = [];

    try {
      const globalRes = await request.post('/api/agent-commands', {
        headers,
        data: { command, matcher, send: 'global $1' },
      });
      expect(globalRes.ok()).toBe(true);

      const initial = await request.post('/api/sessions', {
        headers,
        data: { prompt: '', repoPath: testDir, runnerId, agentType: 'antigravity' },
      });
      expect(initial.status()).toBe(201);
      const firstSession = await initial.json();
      sessions.push(firstSession.id);

      const override = await request.post(`/api/projects/${firstSession.projectId}/agent-commands`, {
        headers,
        data: { command, matcher, send: 'project $1' },
      });
      expect(override.ok()).toBe(true);

      const draft = await request.post('/api/sessions', {
        headers,
        data: { prompt: `/${command} draft`, repoPath: testDir, runnerId, agentType: 'antigravity', isDraft: true, draftTrigger: 'manual' },
      });
      expect(draft.status()).toBe(201);
      const draftSession = await draft.json();
      sessions.push(draftSession.id);
      const draftMessages = await (await request.get(`/api/messages?sessionId=${draftSession.id}`, { headers })).json();
      expect(draftMessages[0]).toMatchObject({ content: `/${command} draft`, prompt: 'project draft' });

      const immediate = await request.post('/api/sessions', {
        headers,
        data: { prompt: `/${command} immediate`, repoPath: testDir, runnerId, agentType: 'antigravity', force: true },
      });
      expect(immediate.status()).toBe(201);
      const immediateSession = await immediate.json();
      sessions.push(immediateSession.id);
      const immediateMessages = await (await request.get(`/api/messages?sessionId=${immediateSession.id}`, { headers })).json();
      expect(immediateMessages.find((item: any) => item.role === 'user')).toMatchObject({
        content: `/${command} immediate`, prompt: 'project immediate',
      });

      const followup = await request.post(`/api/sessions/${firstSession.id}/messages`, {
        headers,
        data: { message: `/${command} followup`, force: true },
      });
      expect(followup.ok()).toBe(true);
      const messages = await (await request.get(`/api/messages?sessionId=${firstSession.id}`, { headers })).json();
      expect(messages.find((item: any) => item.role === 'user')).toMatchObject({
        content: `/${command} followup`, prompt: 'project followup',
      });

      const queued = await request.post(`/api/sessions/${firstSession.id}/todo-messages`, {
        headers,
        data: { message: `/${command} queued`, trigger: { kind: 'manual' } },
      });
      expect(queued.status()).toBe(201);
      expect(await queued.json()).toMatchObject({ content: `/${command} queued`, prompt: 'project queued' });
    } finally {
      for (const id of sessions) await request.delete(`/api/sessions/${id}`, { headers });
      await request.delete(`/api/agent-commands?command=${command}`, { headers });
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  test('should create, update, list, and delete a session successfully', async ({ request }) => {
    // 1. Create a session (use blank prompt to keep status idle and bypass agent execution)
    console.log('[sessions-test] Creating test session...');
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        name: 'My Custom Test Session'
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.name).toBe('My Custom Test Session');
    expect(session.status).toBe('idle');

    const sessionId = session.id;

    // 2. List sessions and verify it exists
    console.log('[sessions-test] Listing sessions...');
    const listRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(listRes.status()).toBe(200);
    const sessions = await listRes.json();
    const found = sessions.find((s: any) => s.id === sessionId);
    expect(found).toBeDefined();
    expect(found.name).toBe('My Custom Test Session');

    // 3. Update (PATCH) session
    console.log('[sessions-test] Updating session...');
    const updateRes = await request.patch(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        name: 'Updated Session Name',
        agentType: 'claude'
      }
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.name).toBe('Updated Session Name');
    expect(updated.agentType).toBe('claude');

    // 4. Delete the session
    console.log('[sessions-test] Deleting session...');
    const deleteRes = await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(deleteRes.status()).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.success).toBeTruthy();

    // 5. Verify it is deleted from list
    console.log('[sessions-test] Verifying deletion...');
    const listAfterRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    const sessionsAfter = await listAfterRes.json();
    const foundAfter = sessionsAfter.find((s: any) => s.id === sessionId);
    expect(foundAfter).toBeUndefined();
  });

  test('should create a no-project session in its own temporary directory', async ({ request }) => {
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        noProject: true,
        runnerId,
        name: 'No Project Session',
      },
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    expect(session.noProject).toBe(true);
    expect(session.projectId).toBeUndefined();
    expect(session.repoPath.startsWith(path.join(os.tmpdir(), 'arondo-session-'))).toBe(true);

    const metadata = JSON.parse(await fs.readFile(
      path.join(os.tmpdir(), 'arondo-test-config', 'sessions', session.id, 'session.json'),
      'utf-8',
    ));
    expect(metadata.noProject).toBe(true);

    await request.delete(`/api/sessions/${session.id}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
  });

  test('should not change session updatedAt when pinning, unpinning, archiving, or unarchiving', async ({ request }) => {
    // 1. Create a session
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        prompt: '',
        repoPath: '/tmp/test-repo',
        runnerId: runnerId,
        name: 'Timestamp Test Session'
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const originalUpdatedAt = session.updatedAt;
    const sessionId = session.id;

    // Small delay to ensure that if updatedAt were updated, the timestamp would differ
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Pin session -> updatedAt must NOT change
    const pinRes = await request.patch(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { pinned: true }
    });
    expect(pinRes.status()).toBe(200);
    const pinnedSession = await pinRes.json();
    expect(pinnedSession.pinnedAt).toBeDefined();
    expect(pinnedSession.updatedAt).toBe(originalUpdatedAt);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Unpin session -> updatedAt must NOT change
    const unpinRes = await request.patch(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: { pinned: false }
    });
    expect(unpinRes.status()).toBe(200);
    const unpinnedSession = await unpinRes.json();
    expect(unpinnedSession.pinnedAt).toBeUndefined();
    expect(unpinnedSession.updatedAt).toBe(originalUpdatedAt);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Archive session -> updatedAt must NOT change
    const archiveRes = await request.post(`/api/sessions/${sessionId}/archive`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(archiveRes.status()).toBe(200);

    const getArchivedRes = await request.get('/api/sessions/archived', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(getArchivedRes.status()).toBe(200);
    const archivedSessions = await getArchivedRes.json();
    const archived = archivedSessions.find((s: any) => s.id === sessionId);
    expect(archived).toBeDefined();
    expect(archived.updatedAt).toBe(originalUpdatedAt);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 5. Unarchive session -> updatedAt must NOT change
    const unarchiveRes = await request.post(`/api/sessions/${sessionId}/unarchive`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(unarchiveRes.status()).toBe(200);
    const unarchived = await unarchiveRes.json();
    expect(unarchived.updatedAt).toBe(originalUpdatedAt);

    // Cleanup
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  });

  test('handles deleted session path: disables chat and hides path from projects', async ({ request }) => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arondo-deleted-path-test-'));

    // 1. Create a session with this test directory
    const createRes = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        repoPath: testDir,
        runnerId,
        agentType: 'antigravity',
      }
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const sessionId = session.id;

    // 2. Check path status while directory exists
    const pathStatusRes1 = await request.get(`/api/sessions/${sessionId}/path-status`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(pathStatusRes1.status()).toBe(200);
    const statusData1 = await pathStatusRes1.json();
    expect(statusData1.exists).toBe(true);
    expect(statusData1.runnerConnected).toBe(true);

    // Verify project appears in GET /api/projects
    const projectsRes1 = await request.get('/api/projects', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(projectsRes1.status()).toBe(200);
    const projectsList1 = await projectsRes1.json();
    const foundProject1 = projectsList1.find((p: any) => p.repoPath === testDir);
    expect(foundProject1).toBeDefined();

    // 3. Delete the directory on runner
    await fs.rm(testDir, { recursive: true, force: true });

    // 4. Verify path status reports exists: false
    const pathStatusRes2 = await request.get(`/api/sessions/${sessionId}/path-status`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(pathStatusRes2.status()).toBe(200);
    const statusData2 = await pathStatusRes2.json();
    expect(statusData2.exists).toBe(false);
    expect(statusData2.runnerConnected).toBe(true);

    // 5. Sending message must fail with 400
    const msgRes = await request.post(`/api/sessions/${sessionId}/messages`, {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        message: 'Hello world',
        force: true,
      }
    });
    expect(msgRes.status()).toBe(400);
    const msgData = await msgRes.json();
    expect(msgData.error).toContain('Session path does not exist on runner');

    // 6. Verify deleted path is excluded from GET /api/projects
    const projectsRes2 = await request.get('/api/projects', {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(projectsRes2.status()).toBe(200);
    const projectsList2 = await projectsRes2.json();
    const foundProject2 = projectsList2.find((p: any) => p.repoPath === testDir);
    expect(foundProject2).toBeUndefined();

    // 7. Session still exists and is not deleted
    const sessionCheck = await request.get(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
    expect(sessionCheck.status()).toBe(200);

    // Cleanup session
    await request.delete(`/api/sessions/${sessionId}`, {
      headers: { 'x-arondo-token': 'test-token-123456' }
    });
  });

  test('rejects creating a session with an existing id and protects immutable fields', async ({ request }) => {
    const headers = { 'x-arondo-token': 'test-token-123456' };
    const createRes = await request.post('/api/sessions', {
      headers,
      data: {
        prompt: 'First prompt',
        repoPath: '/tmp/test-repo-immutable',
        runnerId,
        agentType: 'antigravity',
        force: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const session = await createRes.json();
    const originalProjectId = session.projectId;
    const originalRepoPath = session.repoPath;
    const originalCreatedAt = session.createdAt;

    // Attempt to recreate with the same session id but different repoPath
    const duplicateRes = await request.post('/api/sessions', {
      headers,
      data: {
        id: session.id,
        prompt: 'Overwriting prompt',
        repoPath: '/tmp/different-repo',
        runnerId,
        agentType: 'antigravity',
        force: true,
      },
    });
    expect(duplicateRes.status()).toBe(409);
    const duplicateData = await duplicateRes.json();
    expect(duplicateData.error).toContain('Session already exists');

    // Verify session was not overwritten
    const getRes = await request.get(`/api/sessions/${session.id}`, { headers });
    expect(getRes.status()).toBe(200);
    const sessionAfter = await getRes.json();
    expect(sessionAfter.repoPath).toBe(originalRepoPath);
    expect(sessionAfter.projectId).toBe(originalProjectId);
    expect(sessionAfter.createdAt).toBe(originalCreatedAt);

    // Cleanup
    await request.delete(`/api/sessions/${session.id}`, { headers });
  });
});

