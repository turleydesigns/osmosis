#!/usr/bin/env node
/**
 * Osmosis Daemon for OpenClaw
 * 
 * Runs as a systemd service alongside OpenClaw. Responsibilities:
 * 1. Watch agent session transcripts for tool calls → capture as atoms
 * 2. Serve local REST API for agents to query knowledge
 * 3. Auto-sync local atoms to the mesh server
 */

import { initOsmosis } from './init.js';
import { TranscriptWatcher } from './watcher.js';
import { resolveConfig } from './config.js';

const MESH_URL = process.env.OSMOSIS_MESH_URL ?? 'https://osmosis-mesh-dev.fly.dev';
const DB_PATH = process.env.OSMOSIS_DB_PATH ?? `${process.env.HOME ?? '/root'}/.osmosis/atoms.db`;
const API_PORT = parseInt(process.env.OSMOSIS_API_PORT ?? '7432', 10);
const OPENCLAW_DIR = process.env.OPENCLAW_DIR ?? `${process.env.HOME ?? '/root'}/.openclaw`;
const SYNC_INTERVAL = parseInt(process.env.OSMOSIS_SYNC_INTERVAL ?? '300000', 10); // 5 min

console.log('🧠 Osmosis daemon starting...');
console.log(`   Mesh:     ${MESH_URL}`);
console.log(`   DB:       ${DB_PATH}`);
console.log(`   API:      http://localhost:${API_PORT}`);
console.log(`   OpenClaw: ${OPENCLAW_DIR}`);
console.log(`   Sync:     every ${SYNC_INTERVAL / 1000}s`);

// Initialize Osmosis (local store + sync server + auto-sync)
const handle = initOsmosis(resolveConfig({
  enabled: true,
  dbPath: DB_PATH,
  apiPort: API_PORT,
  meshUrl: MESH_URL,
  syncInterval: SYNC_INTERVAL,
  captureToolCalls: true,
  injectContext: true,
}));

// Start transcript watcher
const watcher = new TranscriptWatcher(handle.store, {
  openclawDir: OPENCLAW_DIR,
  scanIntervalMs: 10_000,
  maxAgeMs: 24 * 60 * 60 * 1000,
});

watcher.start();

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
  watcher.stop();
  handle.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🧠 Osmosis daemon running. Watching for agent activity...');
