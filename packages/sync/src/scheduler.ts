import type { AtomStore } from '@osmosis-ai/core';
import type { SyncConfig } from './config.js';
import { syncWithMesh } from './sync.js';

export interface AutoSyncHandle {
  stop(): void;
}

export function startAutoSync(store: AtomStore, config: SyncConfig): AutoSyncHandle {
  if (!config.autoSync || !config.meshUrl) {
    return { stop() {} };
  }

  const timer = setInterval(async () => {
    try {
      await syncWithMesh(store, config.meshUrl);
    } catch {
      // Silent failure — sync will retry next interval
    }
  }, config.syncIntervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
