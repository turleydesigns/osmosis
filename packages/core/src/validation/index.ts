import { z } from 'zod';

// ── Shared enums ─────────────────────────────────────────────
const TrustTierSchema = z.enum(['quarantine', 'local', 'verified', 'canonical']);
const AtomTypeSchema = z.enum(['tool', 'negative', 'pattern', 'skill', 'context']);
const OutcomeSchema = z.enum(['success', 'failure', 'partial']);
const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const unit = z.number().min(0).max(1);

// ── Base CreateAtom ──────────────────────────────────────────
export const CreateAtomSchema = z.object({
  type: AtomTypeSchema,
  observation: z.string().min(1),
  context: z.string(),
  confidence: unit,
  fitness_score: unit,
  trust_tier: TrustTierSchema,
  source_agent_hash: z.string().min(1),
  decay_rate: unit,
});

// ── CreateToolAtom ───────────────────────────────────────────
export const CreateToolAtomSchema = CreateAtomSchema.extend({
  type: z.literal('tool'),
  tool_name: z.string().min(1),
  params_hash: z.string(),
  outcome: OutcomeSchema,
  error_signature: z.string().nullable(),
  latency_ms: z.number().nullable(),
  reliability_score: unit,
});

// ── CreateNegativeAtom ───────────────────────────────────────
export const CreateNegativeAtomSchema = CreateAtomSchema.extend({
  type: z.literal('negative'),
  anti_pattern: z.string().min(1),
  failure_cluster_size: z.number().int().min(0),
  error_type: z.string().min(1),
  severity: SeveritySchema,
});

// ── OutcomeSignals ───────────────────────────────────────────
export const OutcomeSignalsSchema = z.object({
  completed_without_error: z.boolean(),
  revisited_within_1hr: z.boolean(),
  human_accepted: z.boolean().nullable(),
  convergence_steps: z.number().int().min(0),
  error_free: z.boolean(),
});

/** Validate and return typed data, or throw ZodError */
export function validateCreateAtom(data: unknown) {
  return CreateAtomSchema.parse(data);
}

export function validateCreateToolAtom(data: unknown) {
  return CreateToolAtomSchema.parse(data);
}

export function validateCreateNegativeAtom(data: unknown) {
  return CreateNegativeAtomSchema.parse(data);
}
