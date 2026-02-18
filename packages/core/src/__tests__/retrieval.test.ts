import { describe, it, expect, beforeEach } from 'vitest';
import { AtomStore } from '../store/index.js';
import { searchAtoms, getTopAtoms } from '../retrieval/index.js';

describe('retrieval', () => {
  let store: AtomStore;

  beforeEach(() => {
    store = new AtomStore(':memory:');
    // Seed atoms
    store.createToolAtom({
      type: 'tool', observation: 'Git push to remote origin succeeded',
      context: 'CI pipeline', confidence: 0.9, fitness_score: 0.95,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'git_push', params_hash: 'abc', outcome: 'success',
      error_signature: null, latency_ms: 200, reliability_score: 1.0,
    });
    store.createToolAtom({
      type: 'tool', observation: 'NPM install failed with ERESOLVE peer dependency conflict',
      context: 'package management', confidence: 0.8, fitness_score: 0.3,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'npm_install', params_hash: 'def', outcome: 'failure',
      error_signature: 'ERESOLVE', latency_ms: 5000, reliability_score: 0.0,
    });
    store.createToolAtom({
      type: 'tool', observation: 'Docker build completed with layer caching',
      context: 'containerization', confidence: 0.85, fitness_score: 0.7,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'docker_build', params_hash: 'ghi', outcome: 'success',
      error_signature: null, latency_ms: 30000, reliability_score: 0.9,
    });
  });

  describe('searchAtoms', () => {
    it('finds atoms matching query', () => {
      const results = searchAtoms(store, 'git push');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.observation).toContain('Git push');
    });

    it('finds atoms by error text', () => {
      const results = searchAtoms(store, 'ERESOLVE');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.observation).toContain('ERESOLVE');
    });

    it('returns empty for no match', () => {
      const results = searchAtoms(store, 'xyznonexistent');
      expect(results).toHaveLength(0);
    });

    it('respects limit', () => {
      const results = searchAtoms(store, 'tool', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getTopAtoms', () => {
    it('returns atoms sorted by fitness_score desc', () => {
      const results = getTopAtoms(store);
      expect(results.length).toBe(3);
      expect(results[0]!.fitness_score).toBeGreaterThanOrEqual(results[1]!.fitness_score);
      expect(results[1]!.fitness_score).toBeGreaterThanOrEqual(results[2]!.fitness_score);
    });

    it('filters by type', () => {
      // Add a non-tool atom
      store.createAtom({
        type: 'context', observation: 'Some context note',
        context: 'test', confidence: 0.5, fitness_score: 0.5,
        trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      });
      const tools = getTopAtoms(store, 'tool');
      expect(tools.every(a => a.type === 'tool')).toBe(true);
      expect(tools.length).toBe(3);
    });

    it('respects limit', () => {
      const results = getTopAtoms(store, undefined, 2);
      expect(results.length).toBe(2);
    });
  });
});
