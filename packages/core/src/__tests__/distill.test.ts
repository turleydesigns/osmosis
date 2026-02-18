import { describe, it, expect } from 'vitest';
import { distillTrace, BatchDistiller } from '../distill/index.js';
import type { ToolTrace } from '../distill/index.js';
import type { KnowledgeAtom } from '../types/index.js';

function makeTrace(overrides?: Partial<ToolTrace>): ToolTrace {
  return {
    toolName: 'test_tool',
    params: { key: 'value' },
    result: { ok: true },
    error: null,
    latencyMs: 100,
    outcome: 'success',
    agentId: 'agent-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('distillTrace', () => {
  it('returns null (stub)', async () => {
    const result = await distillTrace(makeTrace());
    expect(result).toBeNull();
  });
});

describe('BatchDistiller', () => {
  it('collects traces up to batch size', () => {
    const bd = new BatchDistiller({ batchSize: 3 });
    expect(bd.pending).toBe(0);
    expect(bd.ready).toBe(false);

    bd.add(makeTrace());
    bd.add(makeTrace());
    expect(bd.pending).toBe(2);
    expect(bd.ready).toBe(false);

    const full = bd.add(makeTrace());
    expect(full).toBe(true);
    expect(bd.ready).toBe(true);
    expect(bd.pending).toBe(3);
  });

  it('flush processes and clears buffer', async () => {
    const bd = new BatchDistiller({ batchSize: 2 });
    bd.add(makeTrace());
    bd.add(makeTrace());

    // Default stub returns null, so results should be empty
    const atoms = await bd.flush();
    expect(atoms).toHaveLength(0);
    expect(bd.pending).toBe(0);
  });

  it('flush with custom distillFn returns atoms', async () => {
    const fakeAtom: KnowledgeAtom = {
      id: 'fake-id', type: 'tool', observation: 'test', context: 'test',
      confidence: 0.9, fitness_score: 0.8, trust_tier: 'local',
      source_agent_hash: 'test', created_at: '', updated_at: '', decay_rate: 0.99,
    };
    const bd = new BatchDistiller({
      batchSize: 2,
      distillFn: async () => fakeAtom,
    });
    bd.add(makeTrace());
    bd.add(makeTrace());

    const atoms = await bd.flush();
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toEqual(fakeAtom);
  });

  it('drain returns traces without processing', () => {
    const bd = new BatchDistiller({ batchSize: 5 });
    bd.add(makeTrace({ toolName: 'a' }));
    bd.add(makeTrace({ toolName: 'b' }));

    const traces = bd.drain();
    expect(traces).toHaveLength(2);
    expect(traces[0]!.toolName).toBe('a');
    expect(bd.pending).toBe(0);
  });
});
