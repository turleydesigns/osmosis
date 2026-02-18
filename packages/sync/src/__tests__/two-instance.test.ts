import { describe, it, expect, afterEach } from 'vitest';
import { AtomStore } from '@osmosis/core';
import { startMeshServer, type MeshServerHandle } from '@osmosis/mesh-server';
import { createSyncServer } from '../server.js';
import { syncWithMesh } from '../sync.js';
import { contributeTo } from '../push.js';
import { learnFrom } from '../pull.js';
import { resolveSyncConfig } from '../config.js';
import type { Server } from 'node:http';

let nextPort = 19432;
function getPort() { return nextPort++; }

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

describe('two-instance sync via mesh', () => {
  let storeA: AtomStore;
  let storeB: AtomStore;
  let serverA: Server;
  let mesh: MeshServerHandle;
  let meshUrl: string;
  let portA: number;

  function setup() {
    portA = getPort();
    const meshPort = getPort();
    storeA = new AtomStore(':memory:');
    storeB = new AtomStore(':memory:');
    meshUrl = `http://localhost:${meshPort}`;
    const config = resolveSyncConfig({ meshUrl, autoSync: false });
    serverA = createSyncServer(storeA, portA, config);
    mesh = startMeshServer({ port: meshPort, dbPath: ':memory:' });
  }

  afterEach(() => {
    try { serverA?.close(); } catch {}
    try { mesh?.stop(); } catch {}
    try { storeA?.close(); } catch {}
    try { storeB?.close(); } catch {}
  });

  it('should push atoms from A to mesh', async () => {
    setup();
    storeA.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));

    const result = await contributeTo(storeA, meshUrl);
    expect(result.errors).toEqual([]);
    expect(result.pushed + result.deduped).toBeGreaterThanOrEqual(1);

    const meshAtoms = mesh.store.getAll();
    expect(meshAtoms.length).toBe(1);
    expect(meshAtoms[0]!.observation).toBe('browser.click fails on hidden elements');
  });

  it('should pull atoms from mesh to B', async () => {
    setup();
    mesh.store.createToolAtom(makeToolAtom('fetch', 'fetch times out on large payloads'));

    const result = await learnFrom(storeB, meshUrl);
    expect(result.errors).toEqual([]);
    expect(result.pulled).toBe(1);

    const bAtoms = storeB.getAll();
    expect(bAtoms.length).toBe(1);
    expect(bAtoms[0]!.observation).toBe('fetch times out on large payloads');
  });

  it('should full sync: A captures, sync to mesh, B syncs from mesh, B captures, sync to mesh, A syncs', async () => {
    setup();

    // Instance A captures some tool calls
    storeA.createToolAtom(makeToolAtom('screenshot', 'screenshot fails on lazy-loaded pages'));
    storeA.createToolAtom(makeToolAtom('exec', 'exec needs pty for interactive commands'));

    // Sync A → mesh
    await syncWithMesh(storeA, meshUrl);
    expect(mesh.store.getAll().length).toBe(2);

    // Sync mesh → B
    await syncWithMesh(storeB, meshUrl);
    expect(storeB.getAll().length).toBe(2);

    // Instance B captures different tool calls
    storeB.createToolAtom(makeToolAtom('file.write', 'file.write creates parent dirs automatically'));

    // Sync B → mesh → A
    await syncWithMesh(storeB, meshUrl);
    await syncWithMesh(storeA, meshUrl);

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

    // Both sync to mesh
    await syncWithMesh(storeA, meshUrl);
    await syncWithMesh(storeB, meshUrl);

    // Mesh should have just 1 atom (deduped)
    expect(mesh.store.getAll().length).toBe(1);
    // Both should still have 1 atom
    expect(storeA.getAll().length).toBe(1);
    expect(storeB.getAll().length).toBe(1);
  });

  it('should filter atoms with ?since= parameter on local server', async () => {
    setup();

    // Create atom at known time
    storeA.createToolAtom(makeToolAtom('old-tool', 'this is an old observation'));

    const sinceTime = new Date().toISOString();

    // Small delay to ensure timestamp difference
    await new Promise(r => setTimeout(r, 50));

    storeA.createToolAtom(makeToolAtom('new-tool', 'this is a totally new and different observation'));

    // Fetch with since filter from local server
    const res = await fetch(`http://localhost:${portA}/atoms?since=${encodeURIComponent(sinceTime)}`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(1);
    expect(atoms[0].tool_name).toBe('new-tool');
  });

  it('should report sync status', async () => {
    setup();
    storeA.createToolAtom(makeToolAtom('test', 'test observation for status'));

    const res = await fetch(`http://localhost:${portA}/sync/status`);
    const status = await res.json() as any;
    expect(status.atomCount).toBe(1);
  });
});
