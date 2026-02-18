import type { AtomStore } from '@osmosis/core';
import type { SyncResult } from './types.js';
import { contributeTo } from './push.js';
import { learnFrom } from './pull.js';

/**
 * Full sync with mesh: contribute local atoms, then learn from mesh.
 */
export async function syncWithMesh(localStore: AtomStore, meshUrl: string): Promise<SyncResult> {
  const pushResult = await contributeTo(localStore, meshUrl);
  const pullResult = await learnFrom(localStore, meshUrl);

  return {
    pushed: pushResult.pushed + pushResult.deduped,
    pulled: pullResult.pulled,
    deduped: pushResult.deduped + pullResult.deduped,
    errors: [...pushResult.errors, ...pullResult.errors],
    timestamp: pullResult.timestamp,
  };
}

// Keep backward compat alias
export const syncWithPeer = syncWithMesh;
