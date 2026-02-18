import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AtomStore, jaccardSimilarity } from '../store/index.js';
import type { CreateAtom, CreateToolAtom, CreateNegativeAtom } from '../types/index.js';

function makeBaseAtom(overrides: Partial<CreateAtom> = {}): CreateAtom {
  return {
    type: 'context',
    observation: 'Test observation',
    context: '{}',
    confidence: 0.8,
    fitness_score: 0.7,
    trust_tier: 'local',
    source_agent_hash: 'test-agent',
    decay_rate: 0.99,
    ...overrides,
  };
}

function makeToolAtom(overrides: Partial<CreateToolAtom> = {}): CreateToolAtom {
  return {
    type: 'tool',
    observation: 'Tool browser.screenshot succeeded',
    context: '{}',
    confidence: 0.8,
    fitness_score: 0.7,
    trust_tier: 'local',
    source_agent_hash: 'test-agent',
    decay_rate: 0.99,
    tool_name: 'browser.screenshot',
    params_hash: 'abc123',
    outcome: 'success',
    error_signature: null,
    latency_ms: 150,
    reliability_score: 0.9,
    ...overrides,
  };
}

function makeNegativeAtom(overrides: Partial<CreateNegativeAtom> = {}): CreateNegativeAtom {
  return {
    type: 'negative',
    observation: 'Never use rm -rf on root',
    context: '{}',
    confidence: 0.95,
    fitness_score: 0.9,
    trust_tier: 'local',
    source_agent_hash: 'test-agent',
    decay_rate: 0.99,
    anti_pattern: 'rm -rf /',
    failure_cluster_size: 5,
    error_type: 'destructive_command',
    severity: 'critical',
    ...overrides,
  };
}

describe('AtomStore', () => {
  let store: AtomStore;

  beforeEach(() => {
    store = new AtomStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('CRUD', () => {
    it('creates and retrieves a base atom', () => {
      const atom = store.createAtom(makeBaseAtom());
      expect(atom.id).toBeTruthy();
      expect(atom.type).toBe('context');
      expect(atom.created_at).toBeTruthy();

      const fetched = store.getById(atom.id);
      expect(fetched).toBeTruthy();
      expect(fetched!.observation).toBe('Test observation');
    });

    it('creates and retrieves a ToolAtom', () => {
      const atom = store.createToolAtom(makeToolAtom());
      expect(atom.tool_name).toBe('browser.screenshot');
      expect(atom.outcome).toBe('success');

      const fetched = store.getById(atom.id);
      expect(fetched).toBeTruthy();
    });

    it('creates and retrieves a NegativeAtom', () => {
      const atom = store.createNegativeAtom(makeNegativeAtom());
      expect(atom.anti_pattern).toBe('rm -rf /');
      expect(atom.severity).toBe('critical');
    });

    it('deletes an atom', () => {
      const atom = store.createAtom(makeBaseAtom());
      expect(store.deleteAtom(atom.id)).toBe(true);
      expect(store.getById(atom.id)).toBeNull();
    });

    it('returns false when deleting non-existent', () => {
      expect(store.deleteAtom('non-existent')).toBe(false);
    });

    it('returns null for non-existent getById', () => {
      expect(store.getById('nope')).toBeNull();
    });
  });

  describe('Queries', () => {
    it('queryByType returns atoms of correct type', () => {
      store.createAtom(makeBaseAtom({ type: 'context', observation: 'ctx 1' }));
      store.createAtom(makeBaseAtom({ type: 'pattern', observation: 'pat 1' }));
      store.createToolAtom(makeToolAtom({ observation: 'tool unique obs 1' }));

      expect(store.queryByType('context')).toHaveLength(1);
      expect(store.queryByType('tool')).toHaveLength(1);
      expect(store.queryByType('pattern')).toHaveLength(1);
    });

    it('queryByToolName filters correctly', () => {
      store.createToolAtom(makeToolAtom({ tool_name: 'browser.screenshot', observation: 'unique obs A' }));
      store.createToolAtom(makeToolAtom({ tool_name: 'exec.run', observation: 'unique obs B' }));

      expect(store.queryByToolName('browser.screenshot')).toHaveLength(1);
      expect(store.queryByToolName('exec.run')).toHaveLength(1);
      expect(store.queryByToolName('nonexistent')).toHaveLength(0);
    });

    it('queryByConfidence returns atoms above threshold', () => {
      store.createAtom(makeBaseAtom({ confidence: 0.3, observation: 'low conf unique' }));
      store.createAtom(makeBaseAtom({ confidence: 0.9, observation: 'high conf unique' }));

      const high = store.queryByConfidence(0.8);
      expect(high).toHaveLength(1);
      expect(high[0]!.confidence).toBe(0.9);
    });

    it('search matches observation text', () => {
      store.createAtom(makeBaseAtom({ observation: 'screenshot fails on lazy loaded pages' }));
      store.createAtom(makeBaseAtom({ observation: 'exec works fine always' }));

      const results = store.search('screenshot');
      expect(results).toHaveLength(1);
      expect(results[0]!.observation).toContain('screenshot');
    });

    it('getAll returns all atoms', () => {
      store.createAtom(makeBaseAtom({ observation: 'unique atom one' }));
      store.createAtom(makeBaseAtom({ observation: 'unique atom two' }));
      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('Decay', () => {
    it('applyDecay reduces fitness scores', () => {
      const atom = store.createAtom(makeBaseAtom({ fitness_score: 1.0 }));
      const changed = store.applyDecay();
      expect(changed).toBe(1);

      const updated = store.getById(atom.id)!;
      expect(updated.fitness_score).toBeCloseTo(0.99);
    });

    it('applyDecay does not affect zero-fitness atoms', () => {
      store.createAtom(makeBaseAtom({ fitness_score: 0.0, observation: 'zero fitness unique' }));
      const changed = store.applyDecay();
      expect(changed).toBe(0);
    });
  });

  describe('Fitness & Usage', () => {
    it('updateFitnessScore changes score', () => {
      const atom = store.createAtom(makeBaseAtom());
      store.updateFitnessScore(atom.id, 0.5);
      expect(store.getById(atom.id)!.fitness_score).toBe(0.5);
    });

    it('recordUsage increments counters', () => {
      const atom = store.createAtom(makeBaseAtom());
      store.recordUsage(atom.id, true);
      store.recordUsage(atom.id, true);
      store.recordUsage(atom.id, false);

      const row = store.getById(atom.id) as any;
      expect(row.use_count).toBe(3);
      expect(row.success_after_use).toBe(2);
      expect(row.failure_after_use).toBe(1);
      expect(row.last_used).toBeTruthy();
    });
  });

  describe('Dedup', () => {
    it('merges atoms with very similar observations', () => {
      const a1 = store.createAtom(makeBaseAtom({ observation: 'browser screenshot fails on lazy loaded pages', fitness_score: 0.5 }));
      const a2 = store.createAtom(makeBaseAtom({ observation: 'browser screenshot fails on lazy loaded pages', fitness_score: 0.8 }));

      // Should have merged — same ID returned
      expect(a2.id).toBe(a1.id);
      const row = store.getById(a1.id) as any;
      expect(row.evidence_count).toBe(2);
      expect(row.fitness_score).toBe(0.8); // keeps higher
    });

    it('does not merge dissimilar observations', () => {
      store.createAtom(makeBaseAtom({ observation: 'browser screenshot fails on lazy loaded pages' }));
      store.createAtom(makeBaseAtom({ observation: 'exec command runs perfectly fine every time' }));
      expect(store.getAll()).toHaveLength(2);
    });

    it('findSimilar returns matches above threshold', () => {
      store.createAtom(makeBaseAtom({ observation: 'the quick brown fox jumps' }));
      store.createAtom(makeBaseAtom({ observation: 'completely different text about cooking recipes' }));

      const similar = store.findSimilar('the quick brown fox jumps over', 0.5);
      expect(similar.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Validation', () => {
    it('rejects invalid confidence', () => {
      expect(() => store.createAtom(makeBaseAtom({ confidence: 1.5 }))).toThrow();
      expect(() => store.createAtom(makeBaseAtom({ confidence: -0.1 }))).toThrow();
    });

    it('rejects invalid fitness_score', () => {
      expect(() => store.createAtom(makeBaseAtom({ fitness_score: 2.0 }))).toThrow();
    });

    it('rejects empty observation', () => {
      expect(() => store.createAtom(makeBaseAtom({ observation: '' }))).toThrow();
    });

    it('rejects invalid tool atom', () => {
      expect(() => store.createToolAtom({ ...makeToolAtom(), tool_name: '' })).toThrow();
    });

    it('rejects invalid negative atom', () => {
      expect(() => store.createNegativeAtom({ ...makeNegativeAtom(), severity: 'invalid' as any })).toThrow();
    });
  });
});

describe('jaccardSimilarity', () => {
  it('identical strings return 1', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('completely different strings return low score', () => {
    expect(jaccardSimilarity('apple banana cherry', 'xray yankee zulu')).toBe(0);
  });

  it('empty strings return 1', () => {
    expect(jaccardSimilarity('', '')).toBe(1);
  });

  it('partially overlapping strings return intermediate score', () => {
    const score = jaccardSimilarity('the quick brown fox', 'the quick red fox');
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(1);
  });
});
