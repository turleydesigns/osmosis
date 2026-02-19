import { describe, it, expect, afterEach } from 'vitest';
import { AtomStore } from '@osmosis-ai/core';
import type { Server } from 'node:http';
import { startMeshServer, type MeshServerHandle } from '@osmosis-ai/mesh-server';
import { contributeTo } from '../push.js';
import { learnFrom } from '../pull.js';
import { syncWithMesh } from '../sync.js';

let nextPort = 19500;
function getPort() { return nextPort++; }

function makeToolAtom(toolName: string, observation: string) {
  return {
    type: 'tool' as const,
    observation,
    context: `testing ${toolName}`,
    confidence: 0.8,
    fitness_score: 0.7,
    trust_tier: 'local' as const,
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

describe('mesh sync: two clients + one mesh', () => {
  let clientA: AtomStore;
  let clientB: AtomStore;
  let mesh: MeshServerHandle;
  let meshUrl: string;

  function setup() {
    const port = getPort();
    clientA = new AtomStore(':memory:');
    clientB = new AtomStore(':memory:');
    mesh = startMeshServer({ port, dbPath: ':memory:' });
    meshUrl = `http://localhost:${port}`;
  }

  afterEach(() => {
    try { mesh?.stop(); } catch {}
    try { clientA?.close(); } catch {}
    try { clientB?.close(); } catch {}
  });

  it('client A contributes atoms to mesh', async () => {
    setup();
    clientA.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));

    const result = await contributeTo(clientA, meshUrl);
    expect(result.errors).toEqual([]);
    expect(result.pushed).toBe(1);

    // Mesh should have the atom
    const meshAtoms = mesh.store.getAll();
    expect(meshAtoms.length).toBe(1);
    expect(meshAtoms[0]!.observation).toBe('browser.click fails on hidden elements');
    // Mesh atoms are quarantined
    expect(meshAtoms[0]!.trust_tier).toBe('quarantine');
  });

  it('client B learns from mesh', async () => {
    setup();
    // Seed the mesh directly
    mesh.store.createToolAtom(makeToolAtom('fetch', 'fetch times out on large payloads'));

    const result = await learnFrom(clientB, meshUrl);
    expect(result.errors).toEqual([]);
    expect(result.pulled).toBe(1);

    const bAtoms = clientB.getAll();
    expect(bAtoms.length).toBe(1);
    expect(bAtoms[0]!.observation).toBe('fetch times out on large payloads');
  });

  it('full flow: A captures → mesh → B learns → B captures → mesh → A learns', async () => {
    setup();

    // Client A captures tool calls
    clientA.createToolAtom(makeToolAtom('screenshot', 'screenshot fails on lazy-loaded pages'));
    clientA.createToolAtom(makeToolAtom('exec', 'exec needs pty for interactive commands'));

    // A contributes to mesh
    await contributeTo(clientA, meshUrl);
    expect(mesh.store.getAll().length).toBe(2);

    // B learns from mesh
    await learnFrom(clientB, meshUrl);
    expect(clientB.getAll().length).toBe(2);

    // B captures different tool calls
    clientB.createToolAtom(makeToolAtom('file.write', 'file.write creates parent dirs automatically'));

    // B contributes to mesh
    await contributeTo(clientB, meshUrl);
    expect(mesh.store.getAll().length).toBe(3);

    // A learns from mesh
    await learnFrom(clientA, meshUrl);

    // Both should have all 3 atoms
    expect(clientA.getAll().length).toBe(3);
    expect(clientB.getAll().length).toBe(3);
    expect(mesh.store.getAll().length).toBe(3);
  });

  it('syncWithMesh does contribute + learn in one call', async () => {
    setup();
    clientA.createToolAtom(makeToolAtom('browser.type', 'browser.type needs focus first'));

    const result = await syncWithMesh(clientA, meshUrl);
    expect(result.errors).toEqual([]);
    expect(result.pushed).toBeGreaterThanOrEqual(1);

    // Mesh has the atom
    expect(mesh.store.getAll().length).toBe(1);
  });

  it('dedup: same observation does not create duplicates on mesh', async () => {
    setup();

    // Both clients have same observation
    clientA.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));
    clientB.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));

    // Both contribute
    await contributeTo(clientA, meshUrl);
    await contributeTo(clientB, meshUrl);

    // Mesh should have 1 atom (deduped)
    expect(mesh.store.getAll().length).toBe(1);
  });

  it('mesh stats endpoint works', async () => {
    setup();
    clientA.createToolAtom(makeToolAtom('tool1', 'observation one'));
    clientA.createToolAtom(makeToolAtom('tool2', 'observation two completely different'));
    await contributeTo(clientA, meshUrl);

    const res = await fetch(`${meshUrl}/mesh/stats`);
    const stats = await res.json() as any;
    expect(stats.totalAtoms).toBe(2);
    expect(stats.contributors).toBeGreaterThanOrEqual(1);
  });

  it('mesh query endpoint works', async () => {
    setup();
    mesh.store.createToolAtom(makeToolAtom('browser.click', 'browser.click fails on hidden elements'));
    mesh.store.createToolAtom(makeToolAtom('fetch', 'fetch times out on large payloads'));

    const res = await fetch(`${meshUrl}/mesh/query?q=browser`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(1);
    expect(atoms[0].tool_name).toBe('browser.click');
  });

  it('incremental sync with since parameter', async () => {
    setup();

    // First sync: A has one atom
    clientA.createToolAtom(makeToolAtom('old-tool', 'old observation'));
    await syncWithMesh(clientA, meshUrl);

    // B syncs — gets 1 atom
    await syncWithMesh(clientB, meshUrl);
    expect(clientB.getAll().length).toBe(1);

    // A adds another atom
    await new Promise(r => setTimeout(r, 50));
    clientA.createToolAtom(makeToolAtom('new-tool', 'completely new and different observation'));
    await contributeTo(clientA, meshUrl);

    // B syncs again — should get only the new one (incremental)
    const result = await learnFrom(clientB, meshUrl);
    expect(result.pulled).toBe(1);
    expect(clientB.getAll().length).toBe(2);
  });
});
