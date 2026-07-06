import fs from 'fs/promises';
import path from 'path';

async function globalTeardown() {
  const testConfigDir = path.resolve(__dirname, '../.arondo-test');
  const testDistDir = path.resolve(__dirname, '../.next-test');
  const runnerBinary = path.resolve(__dirname, '../runner/arondo-runner');

  console.log('Cleaning up test files...');
  try {
    await fs.rm(testConfigDir, { recursive: true, force: true });
    await fs.rm(testDistDir, { recursive: true, force: true });
    await fs.rm(runnerBinary, { force: true });
    console.log('Clean up complete.');
  } catch (err) {
    console.error('Failed to clean up test files:', err);
  }
}

export default globalTeardown;
