import { describe, it, expect, afterEach } from 'vitest';
import { AtomStore, createServer, seedAtoms } from '@osmosis-ai/core';
import { instrumentToolCall, getRelevantContext } from '../index.js';
import type { Server } from 'node:http';

// Helper: HTTP request
function httpRequest(port: number, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => {
      const req = request({ hostname: 'localhost', port, path, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          try { resolve({ status: res.statusCode!, data: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode!, data: text }); }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('Osmosis E2E', () => {
  let store: AtomStore;
  let server: Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
    store?.close();
  });

  it('full loop: instrument → capture → retrieve → inject', async () => {
    store = new AtomStore(':memory:');

    // 1. Create a mock tool function
    const mockTool = async (toolName: string, params: Record<string, unknown>) => {
      if (toolName === 'failing_tool') throw new Error('connection timeout');
      return { ok: true, data: `result for ${toolName}` };
    };

    // 2. Wrap with instrument
    const wrapped = instrumentToolCall(mockTool, store);

    // 3. Success call
    const result = await wrapped('browser.screenshot', { url: 'https://example.com', fullPage: true });
    expect(result).toEqual({ ok: true, data: 'result for browser.screenshot' });

    // 4. Failure call
    await expect(wrapped('failing_tool', { target: 'api' })).rejects.toThrow('connection timeout');

    // 5. Verify atoms captured
    const allAtoms = store.getAll();
    expect(allAtoms.length).toBe(2);

    const successAtom = allAtoms.find(a => (a as any).tool_name === 'browser.screenshot');
    const failAtom = allAtoms.find(a => (a as any).tool_name === 'failing_tool');
    expect(successAtom).toBeDefined();
    expect((successAtom as any).outcome).toBe('success');
    expect(failAtom).toBeDefined();
    expect((failAtom as any).outcome).toBe('failure');
    expect((failAtom as any).error_signature).toContain('connection timeout');

    // 6. Retrieve context
    const context = getRelevantContext('browser screenshot', store);
    expect(context).toBeTruthy();
    expect(context).toContain('browser.screenshot');
  });

  it('API server CRUD and search', async () => {
    store = new AtomStore(':memory:');
    const port = 19876; // random high port
    server = createServer(store, port);

    // Wait for server to be ready
    await new Promise(r => setTimeout(r, 100));

    // POST a tool atom
    const { status: createStatus, data: created } = await httpRequest(port, 'POST', '/atoms', {
      type: 'tool',
      observation: 'exec with timeout prevents hangs',
      context: '{"tool":"exec"}',
      confidence: 0.8,
      fitness_score: 0.75,
      trust_tier: 'local',
      source_agent_hash: 'test',
      decay_rate: 0.99,
      tool_name: 'exec',
      params_hash: 'abc123',
      outcome: 'success',
      error_signature: null,
      latency_ms: 500,
      reliability_score: 0.9,
    });
    expect(createStatus).toBe(201);
    expect(created.id).toBeTruthy();

    // GET all atoms
    const { status: listStatus, data: listed } = await httpRequest(port, 'GET', '/atoms');
    expect(listStatus).toBe(200);
    expect(listed.length).toBe(1);

    // GET by ID
    const { status: getStatus, data: got } = await httpRequest(port, 'GET', `/atoms/${created.id}`);
    expect(getStatus).toBe(200);
    expect(got.observation).toContain('exec');

    // GET search
    const { status: searchStatus, data: searched } = await httpRequest(port, 'GET', '/atoms/search?q=timeout');
    expect(searchStatus).toBe(200);
    expect(searched.length).toBe(1);

    // GET 404
    const { status: notFoundStatus } = await httpRequest(port, 'GET', '/atoms/nonexistent');
    expect(notFoundStatus).toBe(404);
  });

  it('seed atoms populates store', () => {
    store = new AtomStore(':memory:');
    seedAtoms(store);
    const all = store.getAll();
    expect(all.length).toBeGreaterThanOrEqual(12);

    // Verify different types
    const types = new Set(all.map(a => a.type));
    expect(types.has('tool')).toBe(true);
    expect(types.has('negative')).toBe(true);
    expect(types.has('pattern')).toBe(true);
    expect(types.has('context')).toBe(true);
  });

  it('full loop with seeded data: seed → search → context injection', () => {
    store = new AtomStore(':memory:');
    seedAtoms(store);

    // Search for browser-related atoms
    const context = getRelevantContext('browser screenshot lazy loading', store);
    expect(context).toBeTruthy();
    expect(context.length).toBeGreaterThan(0);

    // Search for exec-related atoms
    const execContext = getRelevantContext('exec command timeout', store);
    expect(execContext).toBeTruthy();
  });
});
