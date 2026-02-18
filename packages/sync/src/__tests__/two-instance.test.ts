import { describe, it, expect, afterEach } from 'vitest';
import { AtomStore } from '@osmosis/core';
import type { Server } from 'node:http';
import { createSyncServer } from '../server.js';
import { syncWithPeer } from '../sync.js';
import { pushAtoms } from '../push.js';
import { pullAtoms } from '../pull.js';
import { resolveSyncConfig } from '../config.js';

const PORT_A = 19432;
const PORT_B = 19433;

function makeToolAtom(toolName: string, observation: string) {
  return {
    type: 'tool' as const,
    observation,
    context: `testing ${toolName}`,
    confidence: 0.8,
    fitness_score: 0.7,
    trust_tier: 'quarantine' as const,
    source_agent_hash: 'test-agent-' + toolName,
    decay_rate: 0.99,
    tool_name: toolName,
    params_hash: 'abc123',
    outcome: 'success' as const,
    error_signature: null,
    latency_ms: 100,
    reliability_score: 0.9,
  };
}

describe('two-instance sync', () => {
  let storeA: AtomStore;
  let storeB: AtomStore;
  let serverA: Server;
  let serverB: Server;

  function setup() {
    storeA = new AtomStore(':memory:');
    storeB = new AtomStore(':memory:');
    const config = resolveSyncConfig({ peers: [], autoSync: false });
    serverA = createSyncServer(storeA, PORT_A, config);
    serverB = createSyncServer(storeB, PORT_B, config);
  }

  afterEach(() => {
    try { serverA?.close(); } catch {}
    try { serverB?.close(); } catch {}
    try { storeA?.close(); } catch {}
    try { storeB?.close(); } catch {}
  });

  it('should push atoms from A to B', async () => {
    setup();
    storeA.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));

    const result = await pushAtoms(storeA, `http://localhost:${PORT_B}`);
    expect(result.errors).toEqual([]);
    expect(result.pushed + result.deduped).toBeGreaterThanOrEqual(1);

    const bAtoms = storeB.getAll();
    expect(bAtoms.length).toBe(1);
    expect(bAtoms[0]!.observation).toBe('browser.click fails on hidden elements');
  });

  it('should pull atoms from B to A', async () => {
    setup();
    storeB.createToolAtom(makeToolAtom('fetch', 'fetch times out on large payloads'));

    const result = await pullAtoms(storeA, `http://localhost:${PORT_B}`);
    expect(result.errors).toEqual([]);
    expect(result.pulled).toBe(1);

    const aAtoms = storeA.getAll();
    expect(aAtoms.length).toBe(1);
    expect(aAtoms[0]!.observation).toBe('fetch times out on large payloads');
  });

  it('should full sync: A captures, sync to B, B captures, sync to A', async () => {
    setup();

    // Instance A captures some tool calls
    storeA.createToolAtom(makeToolAtom('screenshot', 'screenshot fails on lazy-loaded pages'));
    storeA.createToolAtom(makeToolAtom('exec', 'exec needs pty for interactive commands'));

    // Sync A → B
    await syncWithPeer(storeA, `http://localhost:${PORT_B}`);
    expect(storeB.getAll().length).toBe(2);

    // Instance B captures different tool calls
    storeB.createToolAtom(makeToolAtom('file.write', 'file.write creates parent dirs automatically'));

    // Sync B → A
    await syncWithPeer(storeA, `http://localhost:${PORT_B}`);
    
    // Both should have everything
    const aAtoms = storeA.getAll();
    const bAtoms = storeB.getAll();
    expect(aAtoms.length).toBe(3);
    expect(bAtoms.length).toBe(3);
  });

  it('should dedup: same observation does not create duplicates', async () => {
    setup();

    // Both instances have the same observation
    storeA.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));
    storeB.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));

    // Sync
    await syncWithPeer(storeA, `http://localhost:${PORT_B}`);

    // B should still have just 1 atom (deduped)
    expect(storeB.getAll().length).toBe(1);
    // A should also still have 1 atom
    expect(storeA.getAll().length).toBe(1);
  });

  it('should filter atoms with ?since= parameter', async () => {
    setup();

    // Create atom at known time
    storeB.createToolAtom(makeToolAtom('old-tool', 'this is an old observation'));
    
    const sinceTime = new Date().toISOString();
    
    // Small delay to ensure timestamp difference
    await new Promise(r => setTimeout(r, 50));
    
    storeB.createToolAtom(makeToolAtom('new-tool', 'this is a totally new and different observation'));

    // Fetch with since filter
    const res = await fetch(`http://localhost:${PORT_B}/atoms?since=${encodeURIComponent(sinceTime)}`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(1);
    expect(atoms[0].tool_name).toBe('new-tool');
  });

  it('should report sync status', async () => {
    setup();
    storeA.createToolAtom(makeToolAtom('test', 'test observation for status'));

    const res = await fetch(`http://localhost:${PORT_A}/sync/status`);
    const status = await res.json() as any;
    expect(status.atomCount).toBe(1);
  });
});
