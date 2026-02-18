// ── Trust Tiers ──────────────────────────────────────────────
export type TrustTier = 'quarantine' | 'local' | 'verified' | 'canonical';

// ── Atom Types ───────────────────────────────────────────────
export type AtomType = 'tool' | 'negative' | 'pattern' | 'skill' | 'context';

// ── Outcome ──────────────────────────────────────────────────
export type Outcome = 'success' | 'failure' | 'partial';

// ── Severity ─────────────────────────────────────────────────
export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ── Base KnowledgeAtom ───────────────────────────────────────
export interface KnowledgeAtom {
  id: string;
  type: AtomType;
  observation: string;
  context: string;
  confidence: number;       // 0–1
  fitness_score: number;    // 0–1
  trust_tier: TrustTier;
  source_agent_hash: string;
  created_at: string;       // ISO-8601
  updated_at: string;       // ISO-8601
  decay_rate: number;       // 0–1, multiplied per epoch
}

// ── ToolAtom ─────────────────────────────────────────────────
export interface ToolAtom extends KnowledgeAtom {
  type: 'tool';
  tool_name: string;
  params_hash: string;
  outcome: Outcome;
  error_signature: string | null;
  latency_ms: number | null;
  reliability_score: number; // 0–1
}

// ── NegativeAtom ─────────────────────────────────────────────
export interface NegativeAtom extends KnowledgeAtom {
  type: 'negative';
  anti_pattern: string;
  failure_cluster_size: number;
  error_type: string;
  severity: Severity;
}

// ── Stub types for future phases ─────────────────────────────
export interface PatternAtom extends KnowledgeAtom {
  type: 'pattern';
}

export interface SkillAtom extends KnowledgeAtom {
  type: 'skill';
}

export interface ContextAtom extends KnowledgeAtom {
  type: 'context';
}

// ── Union type ───────────────────────────────────────────────
export type AnyAtom = ToolAtom | NegativeAtom | PatternAtom | SkillAtom | ContextAtom;

// ── Outcome signals for captureOutcome ───────────────────────
export interface OutcomeSignals {
  completed_without_error: boolean;
  revisited_within_1hr: boolean;
  human_accepted: boolean | null;
  convergence_steps: number;
  error_free: boolean;
}

// ── Create helpers (omit auto-generated fields) ──────────────
export type CreateToolAtom = Omit<ToolAtom, 'id' | 'created_at' | 'updated_at'>;
export type CreateNegativeAtom = Omit<NegativeAtom, 'id' | 'created_at' | 'updated_at'>;
export type CreateAtom = Omit<KnowledgeAtom, 'id' | 'created_at' | 'updated_at'>;
