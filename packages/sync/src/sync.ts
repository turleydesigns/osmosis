import type { AtomStore } from '@osmosis/core';
import type { SyncResult } from './types.js';
import { pushAtoms } from './push.js';
import { pullAtoms } from './pull.js';

export async function syncWithPeer(localStore: AtomStore, peerUrl: string): Promise<SyncResult> {
  const pushResult = await pushAtoms(localStore, peerUrl);
  const pullResult = await pullAtoms(localStore, peerUrl);

  return {
    pushed: pushResult.pushed + pushResult.deduped,
    pulled: pullResult.pulled,
    deduped: pushResult.deduped + pullResult.deduped,
    errors: [...pushResult.errors, ...pullResult.errors],
    timestamp: pullResult.timestamp,
  };
}
