import type { KnowledgeAtom, AtomType } from '../types/index.js';
import type { AtomStore } from '../store/index.js';

/**
 * Search atoms using FTS5 full-text search, ranked by relevance × fitness_score.
 * Falls back to LIKE search if FTS table doesn't exist.
 */
export function searchAtoms(store: AtomStore, query: string, limit: number = 10): KnowledgeAtom[] {
  const db = (store as any).db;

  // Ensure FTS5 table exists
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS atoms_fts USING fts5(
        id UNINDEXED, observation, context, content=atoms, content_rowid=rowid
      );
    `);
    // Rebuild FTS index from current atoms
    db.exec(`INSERT OR REPLACE INTO atoms_fts(atoms_fts) VALUES('rebuild')`);
  } catch {
    // FTS5 not available, fall back to LIKE
    return store.search(query).slice(0, limit);
  }

  try {
    // Escape FTS5 special chars
    const escaped = query.replace(/['"*()]/g, ' ').trim();
    if (!escaped) return [];

    const rows = db.prepare(`
      SELECT a.*, bm25(atoms_fts) as rank
      FROM atoms_fts f
      JOIN atoms a ON a.id = f.id
      WHERE atoms_fts MATCH ?
      ORDER BY (bm25(atoms_fts) * -1) * a.fitness_score DESC
      LIMIT ?
    `).all(escaped, limit) as (KnowledgeAtom & { rank: number })[];

    return rows.map(({ rank, ...atom }) => atom);
  } catch {
    // Fall back to LIKE search
    return store.search(query).slice(0, limit);
  }
}

/**
 * Get top atoms by fitness score, optionally filtered by type.
 */
export function getTopAtoms(store: AtomStore, type?: AtomType, limit: number = 10): KnowledgeAtom[] {
  const db = (store as any).db;

  if (type) {
    return db.prepare(
      'SELECT * FROM atoms WHERE type = ? ORDER BY fitness_score DESC LIMIT ?'
    ).all(type, limit) as KnowledgeAtom[];
  }

  return db.prepare(
    'SELECT * FROM atoms ORDER BY fitness_score DESC LIMIT ?'
  ).all(limit) as KnowledgeAtom[];
}
