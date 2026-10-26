import { test, expect } from '@playwright/test';
import http from 'http';
import { validateAndParseJevInput, executeDecisionSession, DECISION_SCHEMA_HELP } from '../../lib/decision/runner';
import { createSession, getSession, getMessages, getSessionLog } from '../../lib/store';
import { dispatchCreateSession, dispatchFollowupMessage } from '../../lib/session-actions';

test.describe('Decision Mode integration tests', () => {
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalUrl = process.env.TYPESAFE_API_URL;

  test.afterEach(() => {
    if (originalKey !== undefined) process.env.TYPESAFE_API_KEY = originalKey;
    else delete process.env.TYPESAFE_API_KEY;

    if (originalUrl !== undefined) process.env.TYPESAFE_API_URL = originalUrl;
    else delete process.env.TYPESAFE_API_URL;
  });

  test('validateAndParseJevInput enforces JSON and returns examples on invalid input', () => {
    // 1. Non-JSON input
    const nonJson = validateAndParseJevInput('Should we deploy to production?');
    expect(nonJson.ok).toBe(false);
    if (!nonJson.ok) {
      expect(nonJson.error).toContain('Invalid JSON format');
      expect(nonJson.error).toContain('Official TypeSafe Jev Example');
      expect(nonJson.error).toContain('department');
      expect(nonJson.error).toContain('frustration');
      expect(nonJson.error).toContain('is_urgent');
    }

    // 2. Missing questions field
    const missingQ = validateAndParseJevInput(JSON.stringify({ state: 'Some state' }));
    expect(missingQ.ok).toBe(false);
    if (!missingQ.ok) {
      expect(missingQ.error).toContain("Missing or empty 'questions' field");
      expect(missingQ.error).toContain(DECISION_SCHEMA_HELP);
    }

    // 3. Valid JSON with choice, noul, score (model omitted)
    const validJson = JSON.stringify({
      questions: {
        symphony_count: {
          type: 'choice',
          instructions: '勃拉姆斯一共写了几部交响曲？',
          choices: ['2', '4', '9', '15'],
        },
        is_nine: {
          type: 'noul',
          instructions: '勃拉姆斯一生是否写了九部交响曲？',
        },
        risk: {
          type: 'score',
          instructions: 'Assess deployment risk',
          criteria: ['Low', 'Moderate', 'High'],
        },
      },
    });

    const parsed = validateAndParseJevInput(validJson);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.model).toBeUndefined(); // model is omitted by client
      expect(parsed.payload.questions.symphony_count.type).toBe('choice');
      expect(parsed.payload.questions.is_nine.type).toBe('noul');
      expect(parsed.payload.questions.risk.type).toBe('score');
    }
  });

  test('executeDecisionSession returns helpful error and examples when client input is not JSON', async () => {
    process.env.TYPESAFE_API_KEY = 'test-jev-key';

    const session = await createSession({
      status: 'running',
      agentType: 'decision',
      repoPath: '/tmp',
      runnerId: 'mock-runner',
    }, { noProject: true });

    const messageId = 'test-msg-invalid-json';
    await executeDecisionSession(session, messageId, 'Plain natural language prompt without JSON');

    const updated = await getSession(session.id);
    expect(updated?.status).toBe('error');

    const log = await getSessionLog(session.id, messageId, 'agent');
    expect(log).toContain('Invalid JSON format');
    expect(log).toContain('Official TypeSafe Jev Example');
    expect(log).toContain('department');
    expect(log).toContain('frustration');
    expect(log).toContain('is_urgent');

    const messages = await getMessages(session.id);
    const returnMsg = messages.find((m) => m.type === 'agent-return');
    expect(returnMsg?.content).toContain('Invalid Decision Mode input');
  });

  test('executeDecisionSession errors when TYPESAFE_API_KEY is not configured', async () => {
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.JEV_API_KEY;

    const session = await createSession({
      status: 'running',
      agentType: 'decision',
      repoPath: '/tmp',
      runnerId: 'mock-runner',
    }, { noProject: true });

    const messageId = 'test-msg-missing-key';
    await executeDecisionSession(
      session,
      messageId,
      JSON.stringify({
        questions: {
          is_nine: { type: 'noul', instructions: '勃拉姆斯一生是否写了九部交响曲？' },
        },
      }),
    );

    const updated = await getSession(session.id);
    expect(updated?.status).toBe('error');
    expect(updated?.errorMessage).toContain('TYPESAFE_API_KEY is not configured');
  });

  test('executeDecisionSession successfully sends native JSON and fills in default model', async () => {
    let receivedPayload: any = null;
    let authHeader: string | undefined;

    const server = http.createServer((req, res) => {
      authHeader = req.headers['authorization'];
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            answers: {
              symphony_count: {
                choice: '4',
                probabilities: { '2': 0.01, '4': 0.96, '9': 0.02, '15': 0.01 },
                confidence: 0.96,
              },
              is_nine: {
                noul: 0.02,
              },
            },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      process.env.TYPESAFE_API_KEY = 'test-jev-decision-key';
      process.env.TYPESAFE_API_URL = `http://127.0.0.1:${port}/v1/systemone`;

      const session = await createSession({
        status: 'running',
        agentType: 'decision',
        repoPath: '/tmp',
        runnerId: 'mock-runner',
      }, { noProject: true });

      const clientInput = JSON.stringify({
        questions: {
          symphony_count: {
            type: 'choice',
            instructions: '勃拉姆斯一共写了几部交响曲？',
            choices: ['2', '4', '9', '15'],
          },
          is_nine: {
            type: 'noul',
            instructions: '勃拉姆斯一生是否写了九部交响曲？',
          },
        },
      });

      const messageId = 'test-msg-jev-native-json';
      await executeDecisionSession(session, messageId, clientInput);

      expect(authHeader).toBe('Bearer test-jev-decision-key');
      // Verify Arondo automatically supplied model: 'jev-latest'
      expect(receivedPayload.model).toBe('jev-latest');
      expect(receivedPayload.questions.symphony_count).toBeDefined();
      expect(receivedPayload.questions.is_nine).toBeDefined();

      const updated = await getSession(session.id);
      expect(updated?.status).toBe('done');
      expect(updated?.decisionAnswers).toEqual({
        symphony_count: {
          choice: '4',
          probabilities: { '2': 0.01, '4': 0.96, '9': 0.02, '15': 0.01 },
          confidence: 0.96,
        },
        is_nine: { noul: 0.02 },
      });

      const messages = await getMessages(session.id);
      const returnMsg = messages.find((m) => m.type === 'agent-return');
      expect(returnMsg?.content).toContain('symphony_count: 4');
      expect(returnMsg?.content).toContain('is_nine: False / No');

      const log = await getSessionLog(session.id, messageId, 'agent');
      expect(log).toContain('`symphony_count` (`choice`)');
      expect(log).toContain('**`4`**');
      expect(log).toContain('`is_nine` (`noul`)');
      expect(log).toContain('**False / No** (Truth probability: **2.0%**)');
      expect(log).toContain('Jev System One (`jev-latest`)');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('dispatchCreateSession and dispatchFollowupMessage execute cleanly with native Jev JSON', async () => {
    let callCount = 0;
    const server = http.createServer((_req, res) => {
      callCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          answers: {
            db_choice: {
              choice: 'postgres',
              probabilities: { postgres: 0.85, redis: 0.15 },
              confidence: 0.85,
            },
          },
        }),
      );
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      process.env.TYPESAFE_API_KEY = 'test-jev-api-key';
      process.env.TYPESAFE_API_URL = `http://127.0.0.1:${port}/v1/systemone`;

      // 1. Create session with native JSON prompt
      const result = await dispatchCreateSession(
        'mock-runner',
        '/tmp',
        'decision',
        JSON.stringify({
          questions: {
            db_choice: {
              type: 'choice',
              instructions: 'Which DB should we choose?',
              choices: ['postgres', 'redis'],
            },
          },
        }),
        { noProject: true },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected session creation to succeed");
      expect(result.session.agentType).toBe('decision');

      await new Promise((r) => setTimeout(r, 100));

      const updated = await getSession(result.session.id);
      expect(updated?.status).toBe('done');

      // 2. Follow-up message on the same decision session
      const followup = await dispatchFollowupMessage(
        result.session.id,
        JSON.stringify({
          questions: {
            should_index: {
              type: 'noul',
              instructions: 'Should we index this table?',
            },
          },
        }),
        {},
      );

      expect(followup.ok).toBe(true);

      await new Promise((r) => setTimeout(r, 100));

      const afterFollowup = await getSession(result.session.id);
      expect(afterFollowup?.status).toBe('done');
      expect(callCount).toBe(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/sessions creates tempDir + once decision session hidden from GET /api/sessions by default', async ({ request }) => {
    process.env.TYPESAFE_API_KEY = 'test-key';
    const res = await request.post('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
      data: {
        agentType: 'decision',
        tempDir: true,
        once: true,
        prompt: JSON.stringify({
          questions: {
            check: { type: 'noul', instructions: 'Is this working?' },
          },
        }),
      },
    });
    expect(res.status()).toBe(201);
    const session = await res.json();
    expect(session.once).toBe(true);
    expect(session.tempDir).toBe(true);
    expect(session.agentType).toBe('decision');

    // Verify it does NOT appear in GET /api/sessions by default (Web UI session list)
    const listRes = await request.get('/api/sessions', {
      headers: { 'x-arondo-token': 'test-token-123456' },
    });
    expect(listRes.status()).toBe(200);
    const sessions = await listRes.json();
    const found = sessions.some((s: any) => s.id === session.id);
    expect(found).toBe(false);
  });
});
