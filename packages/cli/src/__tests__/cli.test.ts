import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '../../dist/cli.js');

function run(args: string, env: Record<string, string> = {}): string {
  return execSync(`node ${CLI} ${args}`, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 10000,
  }).trim();
}

describe('CLI', () => {
  it('shows help with no args', () => {
    const out = run('');
    expect(out).toContain('Osmosis CLI');
    expect(out).toContain('osmosis serve');
  });

  it('seed + status + search + reset cycle', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'osmosis-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const env = { OSMOSIS_DB_PATH: dbPath };

    try {
      // Seed
      const seedOut = run('seed', env);
      expect(seedOut).toContain('Seeded');
      expect(seedOut).toMatch(/\d+ atoms/);

      // Status
      const statusOut = run('status', env);
      expect(statusOut).toContain('Atoms:');
      expect(statusOut).toContain('Top atoms');

      // Search
      const searchOut = run('search browser screenshot', env);
      expect(searchOut).toContain('Found');

      // Reset
      const resetOut = run('reset', env);
      expect(resetOut).toContain('Deleted');

      // Status after reset
      const emptyStatus = run('status', env);
      expect(emptyStatus).toContain('Atoms: 0');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
