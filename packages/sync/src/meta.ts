import type { AtomStore } from '@osmosis/core';

const SYNC_META_SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_meta (
  peer_url TEXT PRIMARY KEY,
  last_push_at TEXT,
  last_pull_at TEXT
);
`;

function ensureTable(store: AtomStore): void {
  const db = (store as any).db;
  db.exec(SYNC_META_SCHEMA);
}

export function getLastPushAt(store: AtomStore, peerUrl: string): string | null {
  ensureTable(store);
  const db = (store as any).db;
  const row = db.prepare('SELECT last_push_at FROM sync_meta WHERE peer_url = ?').get(peerUrl) as any;
  return row?.last_push_at ?? null;
}

export function getLastPullAt(store: AtomStore, peerUrl: string): string | null {
  ensureTable(store);
  const db = (store as any).db;
  const row = db.prepare('SELECT last_pull_at FROM sync_meta WHERE peer_url = ?').get(peerUrl) as any;
  return row?.last_pull_at ?? null;
}

export function setLastPushAt(store: AtomStore, peerUrl: string, ts: string): void {
  ensureTable(store);
  const db = (store as any).db;
  db.prepare(`
    INSERT INTO sync_meta (peer_url, last_push_at) VALUES (?, ?)
    ON CONFLICT(peer_url) DO UPDATE SET last_push_at = excluded.last_push_at
  `).run(peerUrl, ts);
}

export function setLastPullAt(store: AtomStore, peerUrl: string, ts: string): void {
  ensureTable(store);
  const db = (store as any).db;
  db.prepare(`
    INSERT INTO sync_meta (peer_url, last_pull_at) VALUES (?, ?)
    ON CONFLICT(peer_url) DO UPDATE SET last_pull_at = excluded.last_pull_at
  `).run(peerUrl, ts);
}

export function getAllPeers(store: AtomStore): Array<{ peer_url: string; last_push_at: string | null; last_pull_at: string | null }> {
  ensureTable(store);
  const db = (store as any).db;
  return db.prepare('SELECT * FROM sync_meta').all() as any[];
}
