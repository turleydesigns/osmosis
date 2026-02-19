import { AtomStore } from '@osmosis-ai/core';
import { createMeshServer } from './server.js';
import { resolveMeshConfig, type MeshServerConfig } from './config.js';
import type { Server } from 'node:http';

export { createMeshServer } from './server.js';
export { resolveMeshConfig, DEFAULT_MESH_CONFIG } from './config.js';
export type { MeshServerConfig } from './config.js';

export interface MeshServerHandle {
  store: AtomStore;
  server: Server;
  stop(): void;
}

export function startMeshServer(partial?: Partial<MeshServerConfig>): MeshServerHandle {
  const config = resolveMeshConfig(partial);
  const store = new AtomStore(config.dbPath);
  const server = createMeshServer(store, config);

  return {
    store,
    server,
    stop() {
      server.close();
      store.close();
    },
  };
}
