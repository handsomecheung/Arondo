const DONE_STATUSES = new Set(['done', 'error']);

class ApiRequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function apiRequest(server, token, method, path, payload) {
  const response = await fetch(`${server.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      'x-arondo-token': token,
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();

  if (response.ok) {
    return [response.status, JSON.parse(text)];
  }

  try {
    return [response.status, JSON.parse(text)];
  } catch {
    return [response.status, { error: text }];
  }
}

async function createSession(server, token, runnerId, repoPath, tempDir, prompt, agentType, force) {
  const payload = { prompt, agentType };
  if (tempDir) {
    payload.tempDir = true;
  } else {
    payload.repoPath = repoPath;
  }
  if (runnerId) {
    payload.runnerId = runnerId;
  }
  if (force) {
    payload.force = true;
  }

  const [status, body] = await apiRequest(server, token, 'POST', '/api/sessions', payload);
  if (status !== 201) {
    throw new ApiRequestError(`create session failed (${status}): ${JSON.stringify(body)}`, status, body);
  }
  return body;
}

async function sendMessage(server, token, sessionId, message, force) {
  const payload = { message };
  if (force) {
    payload.force = true;
  }
  const [status, body] = await apiRequest(
    server,
    token,
    'POST',
    `/api/sessions/${sessionId}/messages`,
    payload,
  );
  if (status !== 200) {
    throw new ApiRequestError(`send message failed (${status}): ${JSON.stringify(body)}`, status, body);
  }
  return body;
}

async function getSession(server, token, sessionId) {
  const [status, body] = await apiRequest(server, token, 'GET', `/api/sessions/${sessionId}`);
  if (status !== 200) {
    throw new Error(`get session failed (${status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function listRunners(server, token) {
  const [status, body] = await apiRequest(server, token, 'GET', '/api/runners');
  if (status !== 200) {
    throw new Error(`list runners failed (${status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function getMessages(server, token, sessionId) {
  const [status, body] = await apiRequest(
    server,
    token,
    'GET',
    `/api/messages?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (status !== 200) {
    throw new Error(`get messages failed (${status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function getSessionLog(server, token, sessionId, messageId) {
  const [status, body] = await apiRequest(
    server,
    token,
    'GET',
    `/api/sessions/${encodeURIComponent(sessionId)}/log?messageId=${encodeURIComponent(messageId)}`,
  );
  if (status !== 200) {
    throw new Error(`get session log failed (${status}): ${JSON.stringify(body)}`);
  }
  return body.log;
}

async function pollUntilDone(server, token, sessionId, intervalSeconds, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (true) {
    const session = await getSession(server, token, sessionId);
    console.error(`[poll] status=${session.status}`);
    if (DONE_STATUSES.has(session.status)) {
      return session;
    }
    if (Date.now() >= deadline) {
      throw new Error(`session ${sessionId} did not finish within ${timeoutSeconds}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

module.exports = {
  ApiRequestError,
  apiRequest,
  createSession,
  sendMessage,
  getSession,
  listRunners,
  getMessages,
  getSessionLog,
  pollUntilDone,
};
