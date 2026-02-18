import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AtomStore } from '../store/index.js';
import { captureToolCall, captureOutcome } from '../capture/index.js';
import type { OutcomeSignals } from '../types/index.js';

describe('captureToolCall', () => {
  let store: AtomStore;

  beforeEach(() => { store = new AtomStore(':memory:'); });
  afterEach(() => { store.close(); });

  it('captures a successful tool call', () => {
    const id = captureToolCall(store, 'browser.screenshot', { url: 'https://example.com' }, { data: 'png' });
    const atom = store.getById(id)!;
    expect(atom.type).toBe('tool');
    expect((atom as any).tool_name).toBe('browser.screenshot');
    expect((atom as any).outcome).toBe('success');
    expect(atom.confidence).toBe(0.7);
    expect(atom.fitness_score).toBe(0.8);
    expect((atom as any).error_signature).toBeNull();
  });

  it('captures a failed tool call', () => {
    const id = captureToolCall(store, 'exec.run', { cmd: 'bad' }, null, 'timeout error', 5000);
    const atom = store.getById(id)!;
    expect((atom as any).outcome).toBe('failure');
    expect(atom.confidence).toBe(0.3);
    expect((atom as any).error_signature).toBe('timeout error');
    expect((atom as any).latency_ms).toBe(5000);
  });

  it('captures with null latency', () => {
    const id = captureToolCall(store, 'test.tool', {}, 'ok');
    const atom = store.getById(id)!;
    expect((atom as any).latency_ms).toBeNull();
  });
});

describe('captureOutcome', () => {
  let store: AtomStore;

  beforeEach(() => { store = new AtomStore(':memory:'); });
  afterEach(() => { store.close(); });

  it('scores a perfect outcome', () => {
    const signals: OutcomeSignals = {
      completed_without_error: true,
      revisited_within_1hr: false,
      human_accepted: true,
      convergence_steps: 0,
      error_free: true,
    };
    const id = captureOutcome(store, 'task-1', signals);
    const atom = store.getById(id)!;
    // 0.3 + 0.2 + 0.3 + 0.1 + 0.1 = 1.0
    expect(atom.confidence).toBeCloseTo(1.0);
  });

  it('scores a complete failure', () => {
    const signals: OutcomeSignals = {
      completed_without_error: false,
      revisited_within_1hr: true,
      human_accepted: false,
      convergence_steps: 100,
      error_free: false,
    };
    const id = captureOutcome(store, 'task-2', signals);
    const atom = store.getById(id)!;
    // 0 + 0 + 0 + max(0, 0.1*(1-100/20)) + 0 = 0
    expect(atom.confidence).toBeCloseTo(0.0);
  });

  it('handles null human_accepted as partial credit', () => {
    const signals: OutcomeSignals = {
      completed_without_error: true,
      revisited_within_1hr: false,
      human_accepted: null,
      convergence_steps: 5,
      error_free: true,
    };
    const id = captureOutcome(store, 'task-3', signals);
    const atom = store.getById(id)!;
    // 0.3 + 0.2 + 0.15 + 0.1*(1-5/20) + 0.1 = 0.3+0.2+0.15+0.075+0.1 = 0.825
    expect(atom.confidence).toBeCloseTo(0.825);
  });

  it('caps convergence contribution at 0', () => {
    const signals: OutcomeSignals = {
      completed_without_error: false,
      revisited_within_1hr: false,
      human_accepted: null,
      convergence_steps: 50,
      error_free: false,
    };
    const id = captureOutcome(store, 'task-4', signals);
    const atom = store.getById(id)!;
    // 0 + 0.2 + 0.15 + max(0, ...) + 0 = 0.35
    expect(atom.confidence).toBeCloseTo(0.35);
  });

  it('stores outcome atoms as context type', () => {
    const signals: OutcomeSignals = {
      completed_without_error: true,
      revisited_within_1hr: false,
      human_accepted: true,
      convergence_steps: 0,
      error_free: true,
    };
    const id = captureOutcome(store, 'task-5', signals);
    const atom = store.getById(id)!;
    expect(atom.type).toBe('context');
  });
});
