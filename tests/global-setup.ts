import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

async function globalSetup() {
  const testConfigDir = path.join(os.tmpdir(), 'arondo-test-config');
  
  // Ensure config dir exists
  await fs.mkdir(testConfigDir, { recursive: true });

  // Setup test tokens
  const tokens = {
    clients: [
      {
        token: 'test-token-123456',
        uuid: 'test-uuid-1111-2222-3333',
        name: 'Test Admin User',
        type: 'admin'
      },
      {
        token: 'test-user-token-7890',
        uuid: 'test-uuid-4444-5555-6666',
        name: 'Test Regular User',
        type: 'user'
      }
    ],
    // Each test spec spawns its own Go runner process under a distinct
    // --name, and a runner token locks to the first runner identity that
    // registers with it — so every spec needs its own dedicated token.
    runners: [
      {
        id: 'test-runner-token-id-1',
        token: 'test-runner-token-xyz',
        name: 'Test Runner',
        createdAt: Date.now(),
        boundRunnerId: null
      },
      {
        id: 'test-runner-token-id-2',
        token: 'test-runner-token-fs',
        name: 'Test FS Runner',
        createdAt: Date.now(),
        boundRunnerId: null
      },
      {
        id: 'test-runner-token-id-3',
        token: 'test-runner-token-git',
        name: 'Test Git Runner',
        createdAt: Date.now(),
        boundRunnerId: null
      },
      {
        id: 'test-runner-token-id-4',
        token: 'test-runner-token-exec',
        name: 'Test Exec Runner',
        createdAt: Date.now(),
        boundRunnerId: null
      },
      {
        id: 'test-runner-token-id-5',
        token: 'test-runner-token-sessions',
        name: 'Test Sessions Runner',
        createdAt: Date.now(),
        boundRunnerId: null
      }
    ]
  };

  await fs.writeFile(
    path.join(testConfigDir, 'tokens.json'),
    JSON.stringify(tokens, null, 2),
    'utf-8'
  );

  console.log('Building Go runner...');
  try {
    execSync('go build -o arondo-runner .', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../runner'),
    });
    console.log('Go runner built successfully.');
  } catch (err) {
    console.error('Failed to build Go runner:', err);
    throw err;
  }
}

export default globalSetup;
