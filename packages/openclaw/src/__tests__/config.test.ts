import { describe, it, expect } from 'vitest';
import { resolveConfig, DEFAULT_CONFIG } from '../config.js';

describe('config', () => {
  it('returns defaults when no overrides', () => {
    const config = resolveConfig();
    expect(config.enabled).toBe(false);
    expect(config.apiPort).toBe(7432);
    expect(config.captureToolCalls).toBe(true);
    expect(config.injectContext).toBe(true);
    expect(config.dbPath).toContain('.osmosis');
    expect(config.meshUrl).toBe('https://mesh.osmosis.dev');
  });

  it('merges partial overrides', () => {
    const config = resolveConfig({ enabled: true, apiPort: 9000, meshUrl: 'http://localhost:7433' });
    expect(config.enabled).toBe(true);
    expect(config.apiPort).toBe(9000);
    expect(config.meshUrl).toBe('http://localhost:7433');
    expect(config.captureToolCalls).toBe(true); // default kept
  });

  it('DEFAULT_CONFIG is frozen shape', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(false);
    expect(DEFAULT_CONFIG.dbPath).toContain('atoms.db');
    expect(DEFAULT_CONFIG.meshUrl).toBe('https://mesh.osmosis.dev');
  });
});
