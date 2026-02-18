import type { AtomStore, KnowledgeAtom } from '@osmosis/core';
import type { SyncResult } from './types.js';
import { getLastPullAt, setLastPullAt } from './meta.js';

/**
 * Learn from the mesh server — pull new/updated atoms.
 */
export async function learnFrom(localStore: AtomStore, meshUrl: string): Promise<SyncResult> {
  const errors: string[] = [];
  const since = getLastPullAt(localStore, meshUrl);
  const now = new Date().toISOString();

  let remoteAtoms: KnowledgeAtom[] = [];
  try {
    const url = since
      ? `${meshUrl}/mesh/atoms?since=${encodeURIComponent(since)}`
      : `${meshUrl}/mesh/atoms`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text();
      return { pushed: 0, pulled: 0, deduped: 0, errors: [`Learn failed: ${res.status} ${errBody}`], timestamp: now };
    }
    remoteAtoms = await res.json() as KnowledgeAtom[];
  } catch (err: any) {
    return { pushed: 0, pulled: 0, deduped: 0, errors: [`Learn error: ${err.message}`], timestamp: now };
  }

  let pulled = 0;
  let deduped = 0;

  for (const atom of remoteAtoms) {
    try {
      const { id, created_at, updated_at, ...data } = atom as any;
      let result: KnowledgeAtom;
      if (data.type === 'tool') {
        result = localStore.createToolAtom(data);
      } else if (data.type === 'negative') {
        result = localStore.createNegativeAtom(data);
      } else {
        result = localStore.createAtom(data);
      }

      const ec = (result as any).evidence_count;
      if (ec && ec > 1) {
        deduped++;
      } else {
        pulled++;
      }
    } catch (err: any) {
      errors.push(`Learn insert error: ${err.message}`);
    }
  }

  setLastPullAt(localStore, meshUrl, now);
  return { pushed: 0, pulled, deduped, errors, timestamp: now };
}

// Keep backward compat alias
export const pullAtoms = learnFrom;
