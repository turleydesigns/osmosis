import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AtomStore } from '../store/index.js';
import { computeFitness, recalculateFitness } from '../fitness/index.js';

describe('computeFitness', () => {
  it('returns 0 for unused atoms', () => {
    expect(computeFitness(0, 0, 0, null, 10)).toBe(0);
  });

  it('returns high score for recently used successful atoms', () => {
    const now = new Date();
    const score = computeFitness(10, 9, 1, now.toISOString(), 10, now);
    expect(score).toBeGreaterThan(0.8);
  });

  it('decays with time', () => {
    const now = new Date();
    const recent = computeFitness(5, 5, 0, now.toISOString(), 10, now);
    const old = computeFitness(5, 5, 0, new Date(now.getTime() - 60 * 86400000).toISOString(), 10, now);
    expect(recent).toBeGreaterThan(old);
  });

  it('clamps to [0,1]', () => {
    const score = computeFitness(100, 100, 0, new Date().toISOString(), 100);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('recalculateFitness', () => {
  let store: AtomStore;

  beforeEach(() => { store = new AtomStore(':memory:'); });
  afterEach(() => { store.close(); });

  it('updates fitness scores for all atoms', () => {
    const atom = store.createAtom({
      type: 'context',
      observation: 'test recalc atom',
      context: '{}',
      confidence: 0.8,
      fitness_score: 0.9,
      trust_tier: 'local',
      source_agent_hash: 'test',
      decay_rate: 0.99,
    });

    store.recordUsage(atom.id, true);
    store.recordUsage(atom.id, false);
    store.recordUsage(atom.id, false);
    recalculateFitness(store);

    const updated = store.getById(atom.id)!;
    // 3 uses, 1 success / 2 failures → success_ratio ≈ 0.33, so score < 0.9
    expect(updated.fitness_score).toBeLessThan(0.5);
    expect(updated.fitness_score).toBeGreaterThan(0);
  });
});
