import { defineConfig } from '@playwright/test';
import path from 'path';

const testConfigDir = path.resolve(__dirname, '.arondo-test');

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
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3252',
      ARONDO_CONFIG_DIR: testConfigDir,
      ARONDO_DIST_DIR: '.next-test',
      NODE_ENV: 'development',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
