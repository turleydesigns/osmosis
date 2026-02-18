import Database from 'better-sqlite3';
import type { KnowledgeAtom, ToolAtom, NegativeAtom, CreateAtom, CreateToolAtom, CreateNegativeAtom, AtomType } from '../types/index.js';
import { randomUUID } from 'node:crypto';
import { validateCreateAtom, validateCreateToolAtom, validateCreateNegativeAtom } from '../validation/index.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS atoms (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  observation TEXT NOT NULL,
  context TEXT NOT NULL,
  confidence REAL NOT NULL,
  fitness_score REAL NOT NULL,
  trust_tier TEXT NOT NULL DEFAULT 'quarantine',
  source_agent_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decay_rate REAL NOT NULL DEFAULT 0.99,

  -- ToolAtom fields (nullable)
  tool_name TEXT,
  params_hash TEXT,
  outcome TEXT,
  error_signature TEXT,
  latency_ms REAL,
  reliability_score REAL,

  -- NegativeAtom fields (nullable)
  anti_pattern TEXT,
  failure_cluster_size INTEGER,
  error_type TEXT,
  severity TEXT,

  -- Dedup & fitness fields
  evidence_count INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  success_after_use INTEGER NOT NULL DEFAULT 0,
  failure_after_use INTEGER NOT NULL DEFAULT 0,
  last_used TEXT
);

CREATE INDEX IF NOT EXISTS idx_atoms_type ON atoms(type);
CREATE INDEX IF NOT EXISTS idx_atoms_tool_name ON atoms(tool_name);
CREATE INDEX IF NOT EXISTS idx_atoms_confidence ON atoms(confidence);
CREATE INDEX IF NOT EXISTS idx_atoms_fitness ON atoms(fitness_score);
`;

// Migration: add columns if they don't exist (for existing DBs)
const MIGRATIONS = [
  `ALTER TABLE atoms ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE atoms ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE atoms ADD COLUMN success_after_use INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE atoms ADD COLUMN failure_after_use INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE atoms ADD COLUMN last_used TEXT`,
];

/**
 * Jaccard similarity between two strings (based on word bigrams).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const words = s.toLowerCase().split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      set.add(words[i] + ' ' + words[i + 1]);
    }
    // Also add unigrams for short texts
    for (const w of words) set.add(w);
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export class AtomStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  /** Run schema migrations */
  migrate(): void {
    this.db.exec(SCHEMA_SQL);
    // Apply column migrations for existing DBs (ignore if already exists)
    for (const sql of MIGRATIONS) {
      try { this.db.exec(sql); } catch { /* column already exists */ }
    }
  }

  /** Find atoms with similar observation text */
  findSimilar(observation: string, threshold: number = 0.7): KnowledgeAtom[] {
    const all = this.getAll();
    return all.filter(a => jaccardSimilarity(a.observation, observation) >= threshold);
  }

  /** Insert a base/pattern/skill/context atom (with validation and dedup) */
  createAtom(data: CreateAtom): KnowledgeAtom {
    validateCreateAtom(data);
    // Dedup check
    const similar = this.findSimilar(data.observation, 0.9);
    if (similar.length > 0) {
      const best = similar[0]!;
      this._mergeAtom(best.id, data.fitness_score, data.confidence);
      return this.getById(best.id)!;
    }

    const now = new Date().toISOString();
    const atom: KnowledgeAtom = { id: randomUUID(), ...data, created_at: now, updated_at: now };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate, evidence_count)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate, 1)
    `).run(atom);
    return atom;
  }

  /** Insert a ToolAtom (with validation and dedup) */
  createToolAtom(data: CreateToolAtom): ToolAtom {
    validateCreateToolAtom(data);
    const similar = this.findSimilar(data.observation, 0.9);
    if (similar.length > 0) {
      const best = similar[0]!;
      this._mergeAtom(best.id, data.fitness_score, data.confidence);
      return this.getById(best.id) as ToolAtom;
    }

    const now = new Date().toISOString();
    const atom: ToolAtom = { id: randomUUID(), ...data, created_at: now, updated_at: now };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate,
        tool_name, params_hash, outcome, error_signature, latency_ms, reliability_score, evidence_count)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate,
        @tool_name, @params_hash, @outcome, @error_signature, @latency_ms, @reliability_score, 1)
    `).run(atom);
    return atom;
  }

  /** Insert a NegativeAtom (with validation and dedup) */
  createNegativeAtom(data: CreateNegativeAtom): NegativeAtom {
    validateCreateNegativeAtom(data);
    const similar = this.findSimilar(data.observation, 0.9);
    if (similar.length > 0) {
      const best = similar[0]!;
      this._mergeAtom(best.id, data.fitness_score, data.confidence);
      return this.getById(best.id) as NegativeAtom;
    }

    const now = new Date().toISOString();
    const atom: NegativeAtom = { id: randomUUID(), ...data, created_at: now, updated_at: now };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate,
        anti_pattern, failure_cluster_size, error_type, severity, evidence_count)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate,
        @anti_pattern, @failure_cluster_size, @error_type, @severity, 1)
    `).run(atom);
    return atom;
  }

  /** Merge: keep higher fitness, increment evidence_count */
  private _mergeAtom(existingId: string, newFitness: number, newConfidence: number): void {
    this.db.prepare(`
      UPDATE atoms SET
        fitness_score = MAX(fitness_score, ?),
        confidence = MAX(confidence, ?),
        evidence_count = evidence_count + 1,
        updated_at = ?
      WHERE id = ?
    `).run(newFitness, newConfidence, new Date().toISOString(), existingId);
  }

  /** Get atom by ID */
  getById(id: string): KnowledgeAtom | null {
    const row = this.db.prepare('SELECT * FROM atoms WHERE id = ?').get(id) as KnowledgeAtom | undefined;
    return row ?? null;
  }

  /** Query atoms by type */
  queryByType(type: AtomType): KnowledgeAtom[] {
    return this.db.prepare('SELECT * FROM atoms WHERE type = ?').all(type) as KnowledgeAtom[];
  }

  /** Query tool atoms by tool_name */
  queryByToolName(toolName: string): ToolAtom[] {
    return this.db.prepare('SELECT * FROM atoms WHERE type = ? AND tool_name = ?').all('tool', toolName) as ToolAtom[];
  }

  /** Query atoms with confidence >= threshold */
  queryByConfidence(threshold: number): KnowledgeAtom[] {
    return this.db.prepare('SELECT * FROM atoms WHERE confidence >= ? ORDER BY confidence DESC').all(threshold) as KnowledgeAtom[];
  }

  /** Full-text search on observation */
  search(query: string): KnowledgeAtom[] {
    return this.db.prepare('SELECT * FROM atoms WHERE observation LIKE ? ORDER BY fitness_score DESC')
      .all(`%${query}%`) as KnowledgeAtom[];
  }

  /** Update fitness score for a specific atom */
  updateFitnessScore(id: string, newScore: number): void {
    this.db.prepare('UPDATE atoms SET fitness_score = ?, updated_at = ? WHERE id = ?')
      .run(newScore, new Date().toISOString(), id);
  }

  /** Record a usage event */
  recordUsage(id: string, success: boolean): void {
    const col = success ? 'success_after_use' : 'failure_after_use';
    this.db.prepare(`
      UPDATE atoms SET use_count = use_count + 1, ${col} = ${col} + 1,
        last_used = ?, updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), id);
  }

  /** Apply decay: multiply fitness_score by decay_rate for all atoms */
  applyDecay(): number {
    const result = this.db.prepare(
      'UPDATE atoms SET fitness_score = fitness_score * decay_rate, updated_at = ? WHERE fitness_score > 0'
    ).run(new Date().toISOString());
    return result.changes;
  }

  /** Delete atom by ID */
  deleteAtom(id: string): boolean {
    const result = this.db.prepare('DELETE FROM atoms WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** Get all atoms */
  getAll(): KnowledgeAtom[] {
    return this.db.prepare('SELECT * FROM atoms').all() as KnowledgeAtom[];
  }

  /** Close the database */
  close(): void {
    this.db.close();
  }
}
