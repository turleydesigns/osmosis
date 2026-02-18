import type { AtomStore, KnowledgeAtom } from '@osmosis/core';
import type { SyncResult } from './types.js';
import { getLastPushAt, setLastPushAt } from './meta.js';

export async function pushAtoms(localStore: AtomStore, remoteUrl: string): Promise<SyncResult> {
  const errors: string[] = [];
  const since = getLastPushAt(localStore, remoteUrl);
  const now = new Date().toISOString();

  // Get atoms modified since last sync
  const allAtoms = localStore.getAll();
  const toSync = since
    ? allAtoms.filter(a => a.updated_at > since)
    : allAtoms;

  let pushed = 0;
  let deduped = 0;

  for (const atom of toSync) {
    try {
      const res = await fetch(`${remoteUrl}/atoms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripAutoFields(atom)),
      });

      if (res.ok) {
        const remote = await res.json() as KnowledgeAtom;
        // If remote returned a different ID, it was deduped
        if (remote.id !== atom.id) {
          deduped++;
        } else {
          pushed++;
        }
      } else {
        const errBody = await res.text();
        errors.push(`Push failed for ${atom.id}: ${res.status} ${errBody}`);
      }
    } catch (err: any) {
      errors.push(`Push error for ${atom.id}: ${err.message}`);
    }
  }

  setLastPushAt(localStore, remoteUrl, now);

  return { pushed, pulled: 0, deduped, errors, timestamp: now };
}

/** Strip id, created_at, updated_at so the remote generates its own */
function stripAutoFields(atom: KnowledgeAtom): Record<string, unknown> {
  const { id, created_at, updated_at, ...rest } = atom as any;
  return rest;
}
