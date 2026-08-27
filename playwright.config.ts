import { defineConfig } from '@playwright/test';
import path from 'path';
import os from 'os';

const testConfigDir = path.join(os.tmpdir(), 'arondo-test-config');
const testHomeDir = path.join(testConfigDir, 'home');
process.env.ARONDO_CONFIG_DIR = testConfigDir;
process.env.HOME = testHomeDir;
process.env.USERPROFILE = testHomeDir;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  globalSetup: require.resolve('./tests/global-setup'),
  globalTeardown: require.resolve('./tests/global-teardown'),
  use: {
    baseURL: 'http://localhost:3252',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3252/ping',
    reuseExistingServer: false,
    env: {
      PORT: '3252',
      ARONDO_CONFIG_DIR: testConfigDir,
      ARONDO_DIST_DIR: '.next-test',
      NODE_ENV: 'development',
      HOME: testHomeDir,
      USERPROFILE: testHomeDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
