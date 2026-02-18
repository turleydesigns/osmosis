import { describe, it, expect, afterEach } from 'vitest';
import { AtomStore } from '@osmosis/core';
import { startMeshServer, type MeshServerHandle } from '../index.js';

const PORT = 19600;

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

describe('mesh server', () => {
  let mesh: MeshServerHandle;

  afterEach(() => {
    try { mesh?.stop(); } catch {}
  });

  it('POST /mesh/contribute accepts atoms', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    const res = await fetch(`http://localhost:${PORT}/mesh/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeToolAtom('test', 'test observation')),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.accepted).toBe(1);
    expect(mesh.store.getAll().length).toBe(1);
    // Contributed atoms are quarantined
    expect(mesh.store.getAll()[0]!.trust_tier).toBe('quarantine');
  });

  it('GET /mesh/atoms returns all atoms', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    mesh.store.createToolAtom(makeToolAtom('t1', 'obs one'));
    mesh.store.createToolAtom(makeToolAtom('t2', 'obs two completely different'));

    const res = await fetch(`http://localhost:${PORT}/mesh/atoms`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(2);
  });

  it('GET /mesh/atoms?since= filters by time', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    mesh.store.createToolAtom(makeToolAtom('old', 'old observation'));
    const since = new Date().toISOString();
    await new Promise(r => setTimeout(r, 50));
    mesh.store.createToolAtom(makeToolAtom('new', 'completely new different observation'));

    const res = await fetch(`http://localhost:${PORT}/mesh/atoms?since=${encodeURIComponent(since)}`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(1);
    expect(atoms[0].tool_name).toBe('new');
  });

  it('GET /mesh/query searches atoms', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    mesh.store.createToolAtom(makeToolAtom('browser', 'browser click fails'));
    mesh.store.createToolAtom(makeToolAtom('fetch', 'fetch times out'));

    const res = await fetch(`http://localhost:${PORT}/mesh/query?q=browser`);
    const atoms = await res.json() as any[];
    expect(atoms.length).toBe(1);
  });

  it('GET /mesh/stats returns statistics', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    mesh.store.createToolAtom(makeToolAtom('t1', 'obs one'));
    mesh.store.createToolAtom(makeToolAtom('t2', 'obs two completely different'));

    const res = await fetch(`http://localhost:${PORT}/mesh/stats`);
    const stats = await res.json() as any;
    expect(stats.totalAtoms).toBe(2);
    expect(stats.contributors).toBeGreaterThanOrEqual(1);
  });

  it('batch contribute accepts array', async () => {
    mesh = startMeshServer({ port: PORT, dbPath: ':memory:' });
    const atoms = [
      makeToolAtom('t1', 'first observation'),
      makeToolAtom('t2', 'second completely different observation'),
    ];
    const res = await fetch(`http://localhost:${PORT}/mesh/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(atoms),
    });
    const body = await res.json() as any;
    expect(body.accepted).toBe(2);
    expect(mesh.store.getAll().length).toBe(2);
  });
});
