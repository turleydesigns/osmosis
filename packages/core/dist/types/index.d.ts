export type TrustTier = 'quarantine' | 'local' | 'verified' | 'canonical';
export type AtomType = 'tool' | 'negative' | 'pattern' | 'skill' | 'context';
export type Outcome = 'success' | 'failure' | 'partial';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export interface KnowledgeAtom {
    id: string;
    type: AtomType;
    observation: string;
    context: string;
    confidence: number;
    fitness_score: number;
    trust_tier: TrustTier;
    source_agent_hash: string;
    created_at: string;
    updated_at: string;
    decay_rate: number;
}
export interface ToolAtom extends KnowledgeAtom {
    type: 'tool';
    tool_name: string;
    params_hash: string;
    outcome: Outcome;
    error_signature: string | null;
    latency_ms: number | null;
    reliability_score: number;
}
export interface NegativeAtom extends KnowledgeAtom {
    type: 'negative';
    anti_pattern: string;
    failure_cluster_size: number;
    error_type: string;
    severity: Severity;
}
export interface PatternAtom extends KnowledgeAtom {
    type: 'pattern';
}
export interface SkillAtom extends KnowledgeAtom {
    type: 'skill';
}
export interface ContextAtom extends KnowledgeAtom {
    type: 'context';
}
export type AnyAtom = ToolAtom | NegativeAtom | PatternAtom | SkillAtom | ContextAtom;
export interface OutcomeSignals {
    completed_without_error: boolean;
    revisited_within_1hr: boolean;
    human_accepted: boolean | null;
    convergence_steps: number;
    error_free: boolean;
}
export type CreateToolAtom = Omit<ToolAtom, 'id' | 'created_at' | 'updated_at'>;
export type CreateNegativeAtom = Omit<NegativeAtom, 'id' | 'created_at' | 'updated_at'>;
export type CreateAtom = Omit<KnowledgeAtom, 'id' | 'created_at' | 'updated_at'>;
