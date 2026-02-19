import { describe, it, expect } from 'vitest';
import { AtomStore } from '@osmosis-ai/core';
import { instrumentToolCall } from '../instrument.js';

describe('instrumentToolCall', () => {
  it('captures successful tool calls', async () => {
    const store = new AtomStore(':memory:');
    const original = async (_name: string, _params: Record<string, unknown>) => ({ ok: true });
    const wrapped = instrumentToolCall(original, store);

    const result = await wrapped('test_tool', { key: 'value' });
    expect(result).toEqual({ ok: true });

    const atoms = store.getAll();
    expect(atoms.length).toBe(1);
    expect(atoms[0]!.observation).toContain('test_tool');
    expect(atoms[0]!.observation).toContain('succeeded');
    expect((atoms[0] as any).tool_name).toBe('test_tool');
    expect((atoms[0] as any).outcome).toBe('success');
  });

  it('captures failed tool calls and re-throws', async () => {
    const store = new AtomStore(':memory:');
    const original = async () => { throw new Error('boom'); };
    const wrapped = instrumentToolCall(original, store);

    await expect(wrapped('fail_tool', {})).rejects.toThrow('boom');

    const atoms = store.getAll();
    expect(atoms.length).toBe(1);
    expect(atoms[0]!.observation).toContain('failed');
    expect((atoms[0] as any).outcome).toBe('failure');
    expect((atoms[0] as any).error_signature).toBe('boom');
  });

  it('records latency', async () => {
    const store = new AtomStore(':memory:');
    const original = async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'done';
    };
    const wrapped = instrumentToolCall(original, store);
    await wrapped('slow_tool', {});

    const atom = store.getAll()[0] as any;
    expect(atom.latency_ms).toBeGreaterThanOrEqual(40);
  });
});
