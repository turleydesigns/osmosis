import type { AtomStore } from '@osmosis/core';
import type { SyncConfig } from './config.js';
import { syncWithPeer } from './sync.js';

export interface AutoSyncHandle {
  stop(): void;
}

export function startAutoSync(store: AtomStore, config: SyncConfig): AutoSyncHandle {
  if (!config.autoSync || config.peers.length === 0) {
    return { stop() {} };
  }

  const timer = setInterval(async () => {
    for (const peer of config.peers) {
      try {
        await syncWithPeer(store, peer);
      } catch {
        // Silent failure — sync will retry next interval
      }
    }
  }, config.syncIntervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
