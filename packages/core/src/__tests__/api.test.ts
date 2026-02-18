import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../api/index.js';
import { AtomStore } from '../store/index.js';
import type { Server } from 'node:http';

const PORT = 19876;

function req(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`http://localhost:${PORT}${path}`, opts);
}

describe('REST API', () => {
  let store: AtomStore;
  let server: Server;

  beforeEach(async () => {
    store = new AtomStore(':memory:');
    server = createServer(store, PORT);
    await new Promise(r => server.once('listening', r));
  });

  afterEach(async () => {
    await new Promise<void>(r => server.close(() => r()));
    store.close();
  });

  it('POST /atoms creates a context atom', async () => {
    const res = await req('/atoms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'context', observation: 'API test', context: '{}',
        confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
        source_agent_hash: 'test', decay_rate: 0.99,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
  });

  it('POST /atoms rejects invalid data', async () => {
    const res = await req('/atoms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'context', observation: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /atoms returns all', async () => {
    store.createAtom({
      type: 'context', observation: 'api get test', context: '{}',
      confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
      source_agent_hash: 'test', decay_rate: 0.99,
    });
    const res = await req('/atoms');
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('GET /atoms/:id returns one atom', async () => {
    const atom = store.createAtom({
      type: 'context', observation: 'api id test', context: '{}',
      confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
      source_agent_hash: 'test', decay_rate: 0.99,
    });
    const res = await req(`/atoms/${atom.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(atom.id);
  });

  it('GET /atoms/:id returns 404 for missing', async () => {
    const res = await req('/atoms/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('GET /atoms/search?q= searches', async () => {
    store.createAtom({
      type: 'context', observation: 'screenshot fails on lazy load', context: '{}',
      confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
      source_agent_hash: 'test', decay_rate: 0.99,
    });
    const res = await req('/atoms/search?q=screenshot');
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('GET /atoms?type= filters by type', async () => {
    store.createToolAtom({
      type: 'tool', observation: 'tool filter test', context: '{}',
      confidence: 0.5, fitness_score: 0.5, trust_tier: 'local',
      source_agent_hash: 'test', decay_rate: 0.99,
      tool_name: 'test.tool', params_hash: 'x',
      outcome: 'success', error_signature: null,
      latency_ms: null, reliability_score: 1,
    });
    const res = await req('/atoms?type=tool');
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});
