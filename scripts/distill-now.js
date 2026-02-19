#!/usr/bin/env node
/**
 * Force a distillation run immediately.
 */
const { AtomStore } = await import('/root/osmosis/packages/core/dist/index.js');
const { llmDistill, toCreateAtoms } = await import('/root/osmosis/packages/core/dist/distill/llm.js');

const DB_PATH = process.env.OSMOSIS_DB_PATH ?? `${process.env.HOME}/.osmosis/atoms.db`;
const store = new AtomStore(DB_PATH);

const allAtoms = store.getAll();
const rawAtoms = allAtoms.filter(a => a.type === 'tool');

console.log(`Found ${rawAtoms.length} tool atoms to distill`);

const traces = rawAtoms.map(a => ({
  toolName: a.tool_name ?? 'unknown',
  params: (() => { try { return JSON.parse(a.context || '{}'); } catch { return {}; } })(),
  result: a.outcome === 'success' ? 'ok' : null,
  error: a.error_signature ?? null,
  latencyMs: a.latency_ms ?? 0,
  outcome: (a.outcome ?? 'success'),
  agentId: a.source_agent_hash,
  timestamp: a.created_at,
}));

const config = {
  apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OSMOSIS_DISTILL_MODEL ?? 'google/gemini-2.5-flash',
  minTraces: 3,
  maxTokens: 1024,
};

if (!config.apiKey) {
  console.error('No OPENROUTER_API_KEY set');
  process.exit(1);
}

console.log(`Distilling ${traces.length} traces with ${config.model}...`);

const distilled = await llmDistill(traces, config);
console.log(`Got ${distilled.length} distilled atoms:`);

for (const d of distilled) {
  console.log(`  [${d.kind}] ${d.tool_name}: ${d.observation}`);
}

if (distilled.length > 0) {
  const createAtoms = toCreateAtoms(distilled);
  for (const atom of createAtoms) {
    if (atom.type === 'tool') store.createToolAtom(atom);
    else if (atom.type === 'negative') store.createNegativeAtom(atom);
  }
  console.log(`\n✅ Saved ${distilled.length} distilled atoms to store`);
}

store.close();
