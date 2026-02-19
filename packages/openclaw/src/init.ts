import { AtomStore } from '@osmosis-ai/core';
import { createSyncServer, startAutoSync, resolveSyncConfig } from '@osmosis-ai/sync';
import type { AutoSyncHandle } from '@osmosis-ai/sync';
import type { Server } from 'node:http';
import type { OsmosisConfig } from './config.js';
import { mkdirSync } from 'node:fs';

export interface OsmosisHandle {
  store: AtomStore;
  server: Server;
  autoSync: AutoSyncHandle;
  stop(): void;
}

export function initOsmosis(config: OsmosisConfig): OsmosisHandle {
  // Ensure DB directory exists
  const dir = config.dbPath.substring(0, config.dbPath.lastIndexOf('/'));
  if (dir) mkdirSync(dir, { recursive: true });

  const store = new AtomStore(config.dbPath);

  const syncConfig = resolveSyncConfig({
    meshUrl: config.meshUrl,
    autoSync: !!config.meshUrl,
    syncIntervalMs: config.syncInterval,
  });

  const server = createSyncServer(store, config.apiPort, syncConfig);
  const autoSync = startAutoSync(store, syncConfig);

  return {
    store,
    server,
    autoSync,
    stop() {
      autoSync.stop();
      server.close();
      store.close();
    },
  };
}
