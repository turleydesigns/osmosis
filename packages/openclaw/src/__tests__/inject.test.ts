import { describe, it, expect } from 'vitest';
import { AtomStore } from '@osmosis/core';
import { getRelevantContext } from '../inject.js';

describe('getRelevantContext', () => {
  it('returns empty string for empty store', () => {
    const store = new AtomStore(':memory:');
    const result = getRelevantContext('deploy application', store);
    expect(result).toBe('');
  });

  it('returns formatted tips for matching atoms', () => {
    const store = new AtomStore(':memory:');
    store.createToolAtom({
      type: 'tool', observation: 'Docker build completed with layer caching',
      context: 'containerization', confidence: 0.85, fitness_score: 0.7,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'docker_build', params_hash: 'abc', outcome: 'success',
      error_signature: null, latency_ms: 30000, reliability_score: 0.9,
    });

    const result = getRelevantContext('docker build', store);
    expect(result).toContain('⚡');
    expect(result).toContain('docker_build');
    expect(result).toContain('Docker build');
  });

  it('includes error workaround info', () => {
    const store = new AtomStore(':memory:');
    store.createToolAtom({
      type: 'tool', observation: 'NPM install failed with ERESOLVE',
      context: 'deps', confidence: 0.8, fitness_score: 0.3,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'npm_install', params_hash: 'def', outcome: 'failure',
      error_signature: 'ERESOLVE', latency_ms: 5000, reliability_score: 0.0,
    });

    const result = getRelevantContext('npm install', store);
    expect(result).toContain('Workaround');
    expect(result).toContain('ERESOLVE');
  });

  it('pads results with top fitness atoms when search returns few', () => {
    const store = new AtomStore(':memory:');
    // Add atom that won't match search
    store.createToolAtom({
      type: 'tool', observation: 'Kubernetes deployment scaled replicas',
      context: 'k8s', confidence: 0.9, fitness_score: 0.95,
      trust_tier: 'local', source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'kubectl', params_hash: 'xyz', outcome: 'success',
      error_signature: null, latency_ms: 1000, reliability_score: 1.0,
    });

    const result = getRelevantContext('something totally unrelated xyzabc', store);
    // Should still get the top atom as padding
    expect(result).toContain('kubectl');
  });
});
