import Database from 'better-sqlite3';
import type { KnowledgeAtom, ToolAtom, NegativeAtom, AnyAtom, CreateAtom, CreateToolAtom, CreateNegativeAtom, AtomType } from '../types/index.js';
import { randomUUID } from 'node:crypto';

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
  severity TEXT
);

CREATE INDEX IF NOT EXISTS idx_atoms_type ON atoms(type);
CREATE INDEX IF NOT EXISTS idx_atoms_tool_name ON atoms(tool_name);
CREATE INDEX IF NOT EXISTS idx_atoms_confidence ON atoms(confidence);
CREATE INDEX IF NOT EXISTS idx_atoms_fitness ON atoms(fitness_score);
`;

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
  }

  /** Insert a base/pattern/skill/context atom */
  createAtom(data: CreateAtom): KnowledgeAtom {
    const now = new Date().toISOString();
    const atom: KnowledgeAtom = {
      id: randomUUID(),
      ...data,
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate)
    `).run(atom);
    return atom;
  }

  /** Insert a ToolAtom */
  createToolAtom(data: CreateToolAtom): ToolAtom {
    const now = new Date().toISOString();
    const atom: ToolAtom = {
      id: randomUUID(),
      ...data,
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate,
        tool_name, params_hash, outcome, error_signature, latency_ms, reliability_score)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate,
        @tool_name, @params_hash, @outcome, @error_signature, @latency_ms, @reliability_score)
    `).run(atom);
    return atom;
  }

  /** Insert a NegativeAtom */
  createNegativeAtom(data: CreateNegativeAtom): NegativeAtom {
    const now = new Date().toISOString();
    const atom: NegativeAtom = {
      id: randomUUID(),
      ...data,
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(`
      INSERT INTO atoms (id, type, observation, context, confidence, fitness_score,
        trust_tier, source_agent_hash, created_at, updated_at, decay_rate,
        anti_pattern, failure_cluster_size, error_type, severity)
      VALUES (@id, @type, @observation, @context, @confidence, @fitness_score,
        @trust_tier, @source_agent_hash, @created_at, @updated_at, @decay_rate,
        @anti_pattern, @failure_cluster_size, @error_type, @severity)
    `).run(atom);
    return atom;
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

  /** Update fitness score for a specific atom */
  updateFitnessScore(id: string, newScore: number): void {
    this.db.prepare('UPDATE atoms SET fitness_score = ?, updated_at = ? WHERE id = ?')
      .run(newScore, new Date().toISOString(), id);
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
