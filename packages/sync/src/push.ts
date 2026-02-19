import type { AtomStore, KnowledgeAtom } from '@osmosis-ai/core';
import type { SyncResult } from './types.js';
import { getLastPushAt, setLastPushAt } from './meta.js';

/**
 * Contribute local atoms to the mesh server.
 */
export async function contributeTo(localStore: AtomStore, meshUrl: string, apiKey?: string): Promise<SyncResult> {
  const errors: string[] = [];
  const since = getLastPushAt(localStore, meshUrl);
  const now = new Date().toISOString();

  const allAtoms = localStore.getAll();
  const toSync = since
    ? allAtoms.filter(a => a.updated_at > since)
    : allAtoms;

  if (toSync.length === 0) {
    setLastPushAt(localStore, meshUrl, now);
    return { pushed: 0, pulled: 0, deduped: 0, errors: [], timestamp: now };
  }

  let pushed = 0;
  let deduped = 0;

  try {
    const payload = toSync.map(stripAutoFields);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    
    const res = await fetch(`${meshUrl}/mesh/contribute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const body = await res.json() as { accepted: number; results: Array<{ id: string; status: string }> };
      for (const r of body.results) {
        if (r.status === 'deduped') deduped++;
        else pushed++;
      }
    } else {
      const errBody = await res.text();
      errors.push(`Contribute failed: ${res.status} ${errBody}`);
    }
  } catch (err: any) {
    errors.push(`Contribute error: ${err.message}`);
  }

  setLastPushAt(localStore, meshUrl, now);
  return { pushed, pulled: 0, deduped, errors, timestamp: now };
}

function stripAutoFields(atom: KnowledgeAtom): Record<string, unknown> {
  const { id, created_at, updated_at, ...rest } = atom as any;
  return rest;
}

// Keep backward compat alias
export const pushAtoms = contributeTo;
