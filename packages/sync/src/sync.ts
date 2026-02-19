import type { AtomStore } from '@osmosis-ai/core';
import type { SyncResult } from './types.js';
import { contributeTo } from './push.js';
import { learnFrom } from './pull.js';

/**
 * Full sync with mesh: contribute local atoms, then learn from mesh.
 */
export async function syncWithMesh(localStore: AtomStore, meshUrl: string, apiKey?: string): Promise<SyncResult> {
  const pushResult = await contributeTo(localStore, meshUrl, apiKey);
  const pullResult = await learnFrom(localStore, meshUrl, apiKey);

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
