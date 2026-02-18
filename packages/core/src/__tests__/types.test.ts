import { describe, it, expect } from 'vitest';
import { CreateAtomSchema, CreateToolAtomSchema, CreateNegativeAtomSchema, OutcomeSignalsSchema } from '../validation/index.js';

describe('CreateAtomSchema', () => {
  const valid = {
    type: 'context', observation: 'test', context: '{}',
    confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
    source_agent_hash: 'hash', decay_rate: 0.99,
  };

  it('accepts valid data', () => {
    expect(() => CreateAtomSchema.parse(valid)).not.toThrow();
  });

  it('rejects confidence > 1', () => {
    expect(() => CreateAtomSchema.parse({ ...valid, confidence: 1.1 })).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => CreateAtomSchema.parse({ ...valid, confidence: -0.1 })).toThrow();
  });

  it('rejects empty observation', () => {
    expect(() => CreateAtomSchema.parse({ ...valid, observation: '' })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() => CreateAtomSchema.parse({ ...valid, type: 'invalid' })).toThrow();
  });

  it('rejects invalid trust tier', () => {
    expect(() => CreateAtomSchema.parse({ ...valid, trust_tier: 'bogus' })).toThrow();
  });
});

describe('CreateToolAtomSchema', () => {
  const valid = {
    type: 'tool', observation: 'test', context: '{}',
    confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
    source_agent_hash: 'hash', decay_rate: 0.99,
    tool_name: 'browser.click', params_hash: 'abc',
    outcome: 'success', error_signature: null,
    latency_ms: null, reliability_score: 1.0,
  };

  it('accepts valid tool atom', () => {
    expect(() => CreateToolAtomSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing tool_name', () => {
    const { tool_name, ...rest } = valid;
    expect(() => CreateToolAtomSchema.parse(rest)).toThrow();
  });

  it('rejects invalid outcome', () => {
    expect(() => CreateToolAtomSchema.parse({ ...valid, outcome: 'maybe' })).toThrow();
  });
});

describe('CreateNegativeAtomSchema', () => {
  const valid = {
    type: 'negative', observation: 'test', context: '{}',
    confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
    source_agent_hash: 'hash', decay_rate: 0.99,
    anti_pattern: 'bad thing', failure_cluster_size: 3,
    error_type: 'crash', severity: 'high',
  };

  it('accepts valid negative atom', () => {
    expect(() => CreateNegativeAtomSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() => CreateNegativeAtomSchema.parse({ ...valid, severity: 'extreme' })).toThrow();
  });
});

describe('OutcomeSignalsSchema', () => {
  it('accepts valid signals', () => {
    expect(() => OutcomeSignalsSchema.parse({
      completed_without_error: true,
      revisited_within_1hr: false,
      human_accepted: null,
      convergence_steps: 5,
      error_free: true,
    })).not.toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => OutcomeSignalsSchema.parse({})).toThrow();
  });
});
