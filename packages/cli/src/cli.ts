#!/usr/bin/env node

import { AtomStore, createServer, searchAtoms, getTopAtoms, seedAtoms } from '@osmosis/core';
import { createSyncServer, syncWithMesh, contributeTo, learnFrom, getAllPeers, startAutoSync, resolveSyncConfig } from '@osmosis/sync';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const DEFAULT_DB_PATH = join(homedir(), '.osmosis', 'atoms.db');
const DEFAULT_PORT = 7432;
const DEFAULT_MESH_URL = 'https://mesh.osmosis.dev';

const args = process.argv.slice(2);
const command = args[0];

function getDbPath(): string {
  const idx = args.indexOf('--db');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]!;
  return process.env.OSMOSIS_DB_PATH ?? DEFAULT_DB_PATH;
}

function getPort(): number {
  const idx = args.indexOf('--port');
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1]!, 10);
  return parseInt(process.env.OSMOSIS_PORT ?? String(DEFAULT_PORT), 10);
}

function getMeshUrl(): string {
  const idx = args.indexOf('--mesh');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]!;
  return process.env.OSMOSIS_MESH_URL ?? DEFAULT_MESH_URL;
}

function ensureDir(dbPath: string): void {
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (dir) mkdirSync(dir, { recursive: true });
}

function openStore(): AtomStore {
  const dbPath = getDbPath();
  ensureDir(dbPath);
  return new AtomStore(dbPath);
}

async function main(): Promise<void> {
  switch (command) {
    case 'serve': {
      const store = openStore();
      const port = getPort();
      const meshUrl = getMeshUrl();
      const syncConfig = resolveSyncConfig({
        meshUrl,
        autoSync: true,
      });
      const server = createSyncServer(store, port, syncConfig);
      console.log(`🧠 Osmosis API server listening on http://localhost:${port}`);
      console.log(`   Database: ${getDbPath()}`);
      console.log(`   Mesh: ${meshUrl}`);
      console.log(`   Auto-sync: every ${syncConfig.syncIntervalMs / 1000}s`);
      console.log(`   Press Ctrl+C to stop`);

      const autoSync = startAutoSync(store, syncConfig);

      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        autoSync.stop();
        server.close();
        store.close();
        process.exit(0);
      });
      break;
    }

    case 'mesh-serve': {
      // Dynamically import mesh-server to avoid hard dependency
      const { startMeshServer } = await import('@osmosis/mesh-server');
      const port = getPort();
      const dbPath = getDbPath();
      const handle = startMeshServer({ port, dbPath });
      console.log(`🌐 Osmosis Mesh Server listening on http://localhost:${port}`);
      console.log(`   Database: ${dbPath}`);
      console.log(`   Press Ctrl+C to stop`);

      process.on('SIGINT', () => {
        console.log('\nShutting down mesh server...');
        handle.stop();
        process.exit(0);
      });
      break;
    }

    case 'status': {
      const store = openStore();
      const all = store.getAll();
      const top = getTopAtoms(store, undefined, 5);

      console.log(`🧠 Osmosis Status`);
      console.log(`   Atoms: ${all.length}`);
      console.log(`   Database: ${getDbPath()}`);

      if (all.length > 0) {
        const dates = all.map(a => a.updated_at).sort();
        console.log(`   Last capture: ${dates[dates.length - 1]}`);
        console.log(`\n   Top atoms by fitness:`);
        for (const a of top) {
          const label = (a as any).tool_name ? `[${(a as any).tool_name}]` : `[${a.type}]`;
          console.log(`     ${a.fitness_score.toFixed(2)} ${label} ${a.observation.slice(0, 80)}`);
        }
      } else {
        console.log(`   No atoms yet. Run 'osmosis seed' to add examples.`);
      }
      store.close();
      break;
    }

    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('Usage: osmosis search <query>');
        process.exit(1);
      }
      const store = openStore();
      const results = searchAtoms(store, query, 10);
      if (results.length === 0) {
        console.log('No results found.');
      } else {
        console.log(`Found ${results.length} atom(s):\n`);
        for (const a of results) {
          const label = (a as any).tool_name ? `[${(a as any).tool_name}]` : `[${a.type}]`;
          console.log(`  ${a.fitness_score.toFixed(2)} ${label} ${a.observation}`);
        }
      }
      store.close();
      break;
    }

    case 'seed': {
      const store = openStore();
      const before = store.getAll().length;
      seedAtoms(store);
      const after = store.getAll().length;
      console.log(`🌱 Seeded ${after - before} atoms (total: ${after})`);
      store.close();
      break;
    }

    case 'sync': {
      const store = openStore();
      const meshUrl = getMeshUrl();
      console.log(`🔄 Syncing with mesh at ${meshUrl}...`);
      const result = await syncWithMesh(store, meshUrl);
      console.log(`   Pushed: ${result.pushed}`);
      console.log(`   Pulled: ${result.pulled}`);
      console.log(`   Deduped: ${result.deduped}`);
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.length}`);
        for (const e of result.errors) console.log(`     - ${e}`);
      }
      store.close();
      break;
    }

    case 'contribute': {
      const store = openStore();
      const meshUrl = getMeshUrl();
      console.log(`📤 Contributing to mesh at ${meshUrl}...`);
      const result = await contributeTo(store, meshUrl);
      console.log(`   Pushed: ${result.pushed}`);
      console.log(`   Deduped: ${result.deduped}`);
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.length}`);
        for (const e of result.errors) console.log(`     - ${e}`);
      }
      store.close();
      break;
    }

    case 'learn': {
      const store = openStore();
      const meshUrl = getMeshUrl();
      console.log(`📥 Learning from mesh at ${meshUrl}...`);
      const result = await learnFrom(store, meshUrl);
      console.log(`   Pulled: ${result.pulled}`);
      console.log(`   Deduped: ${result.deduped}`);
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.length}`);
        for (const e of result.errors) console.log(`     - ${e}`);
      }
      store.close();
      break;
    }

    case 'reset': {
      const store = openStore();
      const all = store.getAll();
      let deleted = 0;
      for (const a of all) {
        if (store.deleteAtom(a.id)) deleted++;
      }
      console.log(`🗑️  Deleted ${deleted} atoms. Database is empty.`);
      store.close();
      break;
    }

    default:
      console.log(`🧠 Osmosis CLI v0.1.0

Usage:
  osmosis serve       [--port N] [--db PATH] [--mesh URL]  Start local API server
  osmosis mesh-serve  [--port N] [--db PATH]               Start mesh server
  osmosis sync        [--mesh URL] [--db PATH]             Sync with mesh (contribute + learn)
  osmosis contribute  [--mesh URL] [--db PATH]             Push local atoms to mesh
  osmosis learn       [--mesh URL] [--db PATH]             Pull atoms from mesh
  osmosis status      [--db PATH]                          Show atom count and top atoms
  osmosis search      <query> [--db PATH]                  Search atoms
  osmosis seed        [--db PATH]                          Seed with example atoms
  osmosis reset       [--db PATH]                          Wipe all atoms

Options:
  --db PATH       Database path (default: ~/.osmosis/atoms.db)
  --port N        API port (default: 7432)
  --mesh URL      Mesh server URL (default: https://mesh.osmosis.dev)

Environment:
  OSMOSIS_DB_PATH    Database path override
  OSMOSIS_PORT       API port override
  OSMOSIS_MESH_URL   Mesh server URL override`);
      if (command) process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
