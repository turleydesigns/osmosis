#!/usr/bin/env node

import { AtomStore, createServer, searchAtoms, getTopAtoms, seedAtoms } from '@osmosis-ai/core';
import { createSyncServer, syncWithMesh, contributeTo, learnFrom, getAllPeers, startAutoSync, resolveSyncConfig } from '@osmosis-ai/sync';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const DEFAULT_DB_PATH = join(homedir(), '.osmosis', 'atoms.db');
const DEFAULT_PORT = 7432;
const DEFAULT_MESH_URL = 'https://osmosis-mesh-dev.fly.dev';

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

function getConfigPath(): string {
  return join(homedir(), '.osmosis', 'config.json');
}

function loadConfig(): Record<string, any> {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try { return JSON.parse(readFileSync(configPath, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function saveConfig(config: Record<string, any>): void {
  const configPath = getConfigPath();
  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function getMeshKey(): string {
  const idx = args.indexOf('--key');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]!;
  const config = loadConfig();
  return process.env.MESH_WRITE_KEY ?? config.meshApiKey ?? '';
}

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      const configPath = getConfigPath();
      const osmosisDir = join(homedir(), '.osmosis');
      mkdirSync(osmosisDir, { recursive: true });

      const meshUrl = getMeshUrl();
      console.log('🧠 Initializing Osmosis...\n');

      // Register with mesh and get an API key
      console.log(`   Mesh: ${meshUrl}`);
      let apiKey = '';
      try {
        const res = await fetch(`${meshUrl}/mesh/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: 'cli-init' }) });
        if (res.ok) {
          const body = await res.json() as any;
          apiKey = body.key ?? '';
          console.log(`   API key: provisioned ✅`);
        } else {
          console.log(`   API key: mesh doesn't support auto-registration yet`);
          console.log(`   → Ask the mesh admin for a key, then: osmosis config --key <YOUR_KEY>`);
        }
      } catch {
        console.log(`   API key: could not reach mesh (offline mode is fine)`);
      }

      // Save config
      const config = {
        meshUrl,
        meshApiKey: apiKey,
        dbPath: join(osmosisDir, 'atoms.db'),
        openclawDir: join(homedir(), '.openclaw'),
        apiPort: DEFAULT_PORT,
      };
      saveConfig(config);
      console.log(`   Config: ${configPath}`);
      console.log(`   DB: ${config.dbPath}`);

      // Seed
      const store = new AtomStore(config.dbPath);
      seedAtoms(store);
      const count = store.getAll().length;
      store.close();
      console.log(`   Seeded: ${count} starter atoms`);

      console.log(`\n✅ Osmosis initialized! Next steps:`);
      console.log(`   osmosis start     — start the daemon (watches OpenClaw sessions)`);
      console.log(`   osmosis status    — check your knowledge base`);
      console.log(`   osmosis search    — search for tips`);
      break;
    }

    case 'config': {
      const config = loadConfig();
      const keyIdx = args.indexOf('--key');
      const meshIdx = args.indexOf('--mesh');
      
      if (keyIdx !== -1 && args[keyIdx + 1]) {
        config.meshApiKey = args[keyIdx + 1];
        saveConfig(config);
        console.log('✅ Mesh API key saved');
      } else if (meshIdx !== -1 && args[meshIdx + 1]) {
        config.meshUrl = args[meshIdx + 1];
        saveConfig(config);
        console.log(`✅ Mesh URL set to ${config.meshUrl}`);
      } else {
        console.log('🧠 Osmosis Config:');
        for (const [k, v] of Object.entries(config)) {
          const display = k === 'meshApiKey' && v ? `${String(v).slice(0, 8)}...` : v;
          console.log(`   ${k}: ${display}`);
        }
      }
      break;
    }

    case 'start': {
      const config = loadConfig();
      const dbPath = config.dbPath ?? getDbPath();
      const meshUrl = config.meshUrl ?? getMeshUrl();
      const meshApiKey = config.meshApiKey ?? getMeshKey();
      const openclawDir = config.openclawDir ?? join(homedir(), '.openclaw');
      const port = config.apiPort ?? getPort();

      ensureDir(dbPath);
      const store = new AtomStore(dbPath);

      // Import openclaw modules dynamically
      let watcher: any, injector: any;
      try {
        const oc = await import('@osmosis-ai/openclaw');
        watcher = new oc.TranscriptWatcher(store, {
          openclawDir,
          scanIntervalMs: 10_000,
          maxAgeMs: 365 * 24 * 60 * 60 * 1000,
        });
        watcher.start();

        injector = new oc.ContextInjector(store, {
          workspaceDir: join(openclawDir, 'workspace'),
          updateIntervalMs: 15 * 60 * 1000,
          maxTips: 10,
        });
        injector.start();
      } catch {
        console.log('   @osmosis-ai/openclaw not found — running without OpenClaw integration');
      }

      // Start local API
      const { createSyncServer, startAutoSync, resolveSyncConfig } = await import('@osmosis-ai/sync');
      const syncConfig = resolveSyncConfig({
        meshUrl,
        meshApiKey,
        autoSync: !!meshUrl,
        syncIntervalMs: 5 * 60 * 1000,
      });
      const server = createSyncServer(store, port, syncConfig);
      const autoSync = startAutoSync(store, syncConfig);

      console.log('🧠 Osmosis daemon running');
      console.log(`   API:      http://localhost:${port}`);
      console.log(`   Mesh:     ${meshUrl}`);
      console.log(`   Auth:     ${meshApiKey ? 'key configured' : 'no key'}`);
      console.log(`   OpenClaw: ${openclawDir}`);
      console.log(`   DB:       ${dbPath}`);
      console.log(`   Press Ctrl+C to stop\n`);

      // Periodic status
      const statusTimer = setInterval(() => {
        const all = store.getAll();
        const watcherStats = watcher?.stats ?? { capturedCount: 0, filesWatched: 0 };
        console.log(`📊 ${all.length} atoms | Captured: ${watcherStats.capturedCount} | Files: ${watcherStats.filesWatched}`);
      }, 60_000);

      const shutdown = () => {
        console.log('\n🧠 Shutting down...');
        clearInterval(statusTimer);
        watcher?.stop();
        injector?.stop();
        autoSync.stop();
        server.close();
        store.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      break;
    }

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
      const { startMeshServer } = await import('@osmosis-ai/mesh-server');
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
      const meshKey = getMeshKey();
      console.log(`🔄 Syncing with mesh at ${meshUrl}...`);
      const result = await syncWithMesh(store, meshUrl, meshKey);
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
      const meshKey = getMeshKey();
      console.log(`📤 Contributing to mesh at ${meshUrl}...`);
      const result = await contributeTo(store, meshUrl, meshKey);
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
      const meshKey = getMeshKey();
      console.log(`📥 Learning from mesh at ${meshUrl}...`);
      const result = await learnFrom(store, meshUrl, meshKey);
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
      console.log(`🧠 Osmosis CLI v0.5.0 — Collective intelligence for AI agents

Quick Start:
  osmosis init                                             Set up Osmosis (first time)
  osmosis start                                            Start daemon (watches agents, syncs to mesh)
  osmosis status                                           Check your knowledge base

Commands:
  osmosis init        [--mesh URL]                         Initialize config + seed knowledge
  osmosis start       [--port N]                           Start daemon (watcher + sync + API)
  osmosis config      [--key KEY] [--mesh URL]             View/update config
  osmosis status      [--db PATH]                          Show atom count and top atoms
  osmosis search      <query> [--db PATH]                  Search atoms
  osmosis sync        [--mesh URL] [--key KEY]             Sync with mesh (push + pull)
  osmosis contribute  [--mesh URL] [--key KEY]             Push local atoms to mesh
  osmosis learn       [--mesh URL] [--key KEY]             Pull atoms from mesh
  osmosis seed        [--db PATH]                          Seed with starter knowledge
  osmosis serve       [--port N] [--db PATH] [--mesh URL]  Start local API only
  osmosis reset       [--db PATH]                          Wipe all atoms

Config: ~/.osmosis/config.json
Database: ~/.osmosis/atoms.db

https://github.com/turleydesigns/osmosis`);
      if (command) process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
