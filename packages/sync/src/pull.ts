import type { AtomStore, KnowledgeAtom } from '@osmosis/core';
import type { SyncResult } from './types.js';
import { getLastPullAt, setLastPullAt } from './meta.js';

export async function pullAtoms(localStore: AtomStore, remoteUrl: string): Promise<SyncResult> {
  const errors: string[] = [];
  const since = getLastPullAt(localStore, remoteUrl);
  const now = new Date().toISOString();

  let remoteAtoms: KnowledgeAtom[] = [];
  try {
    const url = since
      ? `${remoteUrl}/atoms?since=${encodeURIComponent(since)}`
      : `${remoteUrl}/atoms`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text();
      return { pushed: 0, pulled: 0, deduped: 0, errors: [`Pull failed: ${res.status} ${errBody}`], timestamp: now };
    }
    remoteAtoms = await res.json() as KnowledgeAtom[];
  } catch (err: any) {
    return { pushed: 0, pulled: 0, deduped: 0, errors: [`Pull error: ${err.message}`], timestamp: now };
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
      // If the local store returned an existing atom (dedup), count it
      // We can detect dedup by checking if the atom already existed
      // Since createXAtom does dedup internally and returns the merged atom,
      // we check if the result's created_at is before our sync window
      if (result.created_at < now && result.updated_at <= now) {
        // Could be new or deduped — check if observation matches an existing
        // Simple heuristic: if evidence_count > 1 on result, it was merged
        const ec = (result as any).evidence_count;
        if (ec && ec > 1) {
          deduped++;
        } else {
          pulled++;
        }
      } else {
        pulled++;
      }
    } catch (err: any) {
      errors.push(`Pull insert error: ${err.message}`);
    }
  }

  setLastPullAt(localStore, remoteUrl, now);

  return { pushed: 0, pulled, deduped, errors, timestamp: now };
}
