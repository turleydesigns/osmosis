#!/usr/bin/env node
/**
 * Osmosis Daemon for OpenClaw
 * 
 * Runs as a systemd service alongside OpenClaw. Responsibilities:
 * 1. Watch agent session transcripts for tool calls → capture as atoms
 * 2. Serve local REST API for agents to query knowledge
 * 3. Auto-sync local atoms to the mesh server
 */

import { join } from 'node:path';
import { initOsmosis } from './init.js';
import { TranscriptWatcher } from './watcher.js';
import { resolveConfig } from './config.js';
import { ContextInjector } from './context-injector.js';
import { BatchDistiller } from '@osmosis-ai/core';
import { llmDistill, toCreateAtoms, type LLMDistillConfig, DEFAULT_LLM_CONFIG } from '@osmosis-ai/core/dist/distill/llm.js';

const MESH_URL = process.env.OSMOSIS_MESH_URL ?? 'https://osmosis-mesh-dev.fly.dev';
const DB_PATH = process.env.OSMOSIS_DB_PATH ?? `${process.env.HOME ?? '/root'}/.osmosis/atoms.db`;
const API_PORT = parseInt(process.env.OSMOSIS_API_PORT ?? '7432', 10);
const OPENCLAW_DIR = process.env.OPENCLAW_DIR ?? `${process.env.HOME ?? '/root'}/.openclaw`;
const SYNC_INTERVAL = parseInt(process.env.OSMOSIS_SYNC_INTERVAL ?? '300000', 10); // 5 min
const MESH_WRITE_KEY = process.env.MESH_WRITE_KEY ?? '';

console.log('🧠 Osmosis daemon starting...');
console.log(`   Mesh:     ${MESH_URL}`);
console.log(`   DB:       ${DB_PATH}`);
console.log(`   API:      http://localhost:${API_PORT}`);
console.log(`   OpenClaw: ${OPENCLAW_DIR}`);
console.log(`   Sync:     every ${SYNC_INTERVAL / 1000}s`);
console.log(`   Auth:     ${MESH_WRITE_KEY ? 'key configured' : 'NO KEY (sync will fail on authed mesh)'}`);

// Initialize Osmosis (local store + sync server + auto-sync)
const handle = initOsmosis(resolveConfig({
  enabled: true,
  dbPath: DB_PATH,
  apiPort: API_PORT,
  meshUrl: MESH_URL,
  syncInterval: SYNC_INTERVAL,
  meshApiKey: MESH_WRITE_KEY,
  captureToolCalls: true,
  injectContext: true,
}));

// Start transcript watcher
const MAX_AGE = parseInt(process.env.OSMOSIS_MAX_AGE_DAYS ?? '365', 10);
const watcher = new TranscriptWatcher(handle.store, {
  openclawDir: OPENCLAW_DIR,
  scanIntervalMs: 10_000,
  maxAgeMs: MAX_AGE * 24 * 60 * 60 * 1000,
});

watcher.start();

// Start context injector (writes OSMOSIS_TIPS.md to agent workspaces)
const injector = new ContextInjector(handle.store, {
  workspaceDir: join(OPENCLAW_DIR, 'workspace'),
  updateIntervalMs: 15 * 60 * 1000, // 15 min
  maxTips: 10,
});
injector.start();

// Set up LLM distillation (runs periodically on captured traces)
const LLM_API_KEY = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '';
const LLM_API_URL = process.env.OPENROUTER_API_KEY 
  ? 'https://openrouter.ai/api/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = process.env.OSMOSIS_DISTILL_MODEL ?? (process.env.OPENROUTER_API_KEY ? 'google/gemini-2.5-flash' : 'gpt-4o-mini');

if (LLM_API_KEY) {
  console.log(`🧪 LLM distillation enabled (model: ${LLM_MODEL})`);
  
  const distillConfig: LLMDistillConfig = {
    ...DEFAULT_LLM_CONFIG,
    apiUrl: LLM_API_URL,
    apiKey: LLM_API_KEY,
    model: LLM_MODEL,
    minTraces: 10,
  };

  // Run distillation every 30 min
  setInterval(async () => {
    try {
      const allAtoms = handle.store.getAll();
      // Get raw tool atoms that haven't been distilled (source_agent_hash = 'local')
      const rawAtoms = allAtoms.filter(a => 
        a.type === 'tool' && a.source_agent_hash === 'local'
      );
      
      if (rawAtoms.length < distillConfig.minTraces) return;
      
      // Convert to traces for the distiller
      const traces = rawAtoms.map(a => ({
        toolName: (a as any).tool_name ?? 'unknown',
        params: JSON.parse(a.context || '{}'),
        result: (a as any).outcome === 'success' ? 'ok' : null,
        error: (a as any).error_signature ?? null,
        latencyMs: (a as any).latency_ms ?? 0,
        outcome: ((a as any).outcome ?? 'success') as 'success' | 'failure' | 'partial',
        agentId: a.source_agent_hash,
        timestamp: a.created_at,
      }));

      console.log(`🧪 Distilling ${traces.length} traces...`);
      const distilled = await llmDistill(traces, distillConfig);
      
      if (distilled.length > 0) {
        const createAtoms = toCreateAtoms(distilled);
        for (const atom of createAtoms) {
          if (atom.type === 'tool') {
            handle.store.createToolAtom(atom as any);
          } else if (atom.type === 'negative') {
            handle.store.createNegativeAtom(atom as any);
          }
        }
        console.log(`🧪 Distilled ${distilled.length} new knowledge atoms`);
      }
    } catch (err) {
      console.error(`🧪 Distillation error: ${err}`);
    }
  }, 30 * 60 * 1000);
} else {
  console.log('🧪 LLM distillation disabled (no OPENAI_API_KEY or OPENROUTER_API_KEY)');
}

// Status endpoint on the local API
const statsInterval = setInterval(() => {
  const stats = watcher.stats;
  const allAtoms = handle.store.getAll();
  if (stats.capturedCount > 0 || allAtoms.length > 0) {
    console.log(`📊 Atoms: ${allAtoms.length} local | Captured: ${stats.capturedCount} | Files: ${stats.filesWatched}`);
  }
}, 60_000);

// Graceful shutdown
function shutdown() {
  console.log('\n🧠 Osmosis daemon shutting down...');
  clearInterval(statsInterval);
  injector.stop();
  watcher.stop();
  handle.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🧠 Osmosis daemon running. Watching for agent activity...');
