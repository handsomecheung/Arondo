import { test, expect } from '@playwright/test';
import { splitPathForMiddleTruncate } from '../lib/homeUtils';

test.describe('splitPathForMiddleTruncate tests', () => {
  test('correctly splits long unix paths preserving prefix and suffix', () => {
    const fullPath = '/mnt/coder-workspaces/private-workspace/repos/github/Arondo';
    const { prefix, suffix } = splitPathForMiddleTruncate(fullPath);
    expect(prefix).toBe('/mnt/coder-workspaces/private-workspace/repos');
    expect(suffix).toBe('/github/Arondo');
    expect(prefix + suffix).toBe(fullPath);
  });

  test('correctly splits three-segment unix paths', () => {
    const fullPath = '/home/user/project';
    const { prefix, suffix } = splitPathForMiddleTruncate(fullPath);
    expect(prefix).toBe('/home');
    expect(suffix).toBe('/user/project');
    expect(prefix + suffix).toBe(fullPath);
  });

  test('correctly splits two-segment unix paths', () => {
    const fullPath = '/project/app';
    const { prefix, suffix } = splitPathForMiddleTruncate(fullPath);
    expect(prefix).toBe('/project');
    expect(suffix).toBe('/app');
    expect(prefix + suffix).toBe(fullPath);
  });

  test('correctly handles paths with trailing slash', () => {
    const fullPath = '/var/log/nginx/';
    const { prefix, suffix } = splitPathForMiddleTruncate(fullPath);
    expect(prefix).toBe('/var');
    expect(suffix).toBe('/log/nginx/');
    expect(prefix + suffix).toBe(fullPath);
  });

  test('correctly handles windows paths', () => {
    const fullPath = 'C:\\Users\\admin\\workspace\\my-repo';
    const { prefix, suffix } = splitPathForMiddleTruncate(fullPath);
    expect(prefix).toBe('C:\\Users\\admin');
    expect(suffix).toBe('\\workspace\\my-repo');
    expect(prefix + suffix).toBe(fullPath);
  });

  test('handles empty or single-segment strings gracefully', () => {
    expect(splitPathForMiddleTruncate('')).toEqual({ prefix: '', suffix: '' });
    const single = 'singlefolder';
    const { prefix, suffix } = splitPathForMiddleTruncate(single);
    expect(prefix + suffix).toBe(single);
  });
});
