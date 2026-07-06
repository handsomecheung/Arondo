import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

async function globalSetup() {
  const testConfigDir = path.resolve(__dirname, '../.arondo-test');
  
  // Ensure config dir exists
  await fs.mkdir(testConfigDir, { recursive: true });

  // Setup test tokens
  const tokens = [
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
  ];

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
