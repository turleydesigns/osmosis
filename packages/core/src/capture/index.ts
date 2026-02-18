import { createHash, randomUUID } from 'node:crypto';
import type { OutcomeSignals, CreateToolAtom, Outcome } from '../types/index.js';
import { AtomStore } from '../store/index.js';

/**
 * Capture a tool call and persist it as a ToolAtom in the local store.
 */
export function captureToolCall(
  store: AtomStore,
  toolName: string,
  params: Record<string, unknown>,
  result: unknown,
  error?: string | null,
  latencyMs?: number | null,
): string {
  const paramsHash = createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 16);
  const outcome: Outcome = error ? 'failure' : 'success';

  const atom = store.createToolAtom({
    type: 'tool',
    observation: error
      ? `Tool "${toolName}" failed: ${error}`
      : `Tool "${toolName}" succeeded`,
    context: JSON.stringify({ params_summary: Object.keys(params), has_result: result != null }),
    confidence: error ? 0.3 : 0.7,
    fitness_score: error ? 0.2 : 0.8,
    trust_tier: 'local',
    source_agent_hash: 'local',
    decay_rate: 0.99,
    tool_name: toolName,
    params_hash: paramsHash,
    outcome,
    error_signature: error ?? null,
    latency_ms: latencyMs ?? null,
    reliability_score: error ? 0.0 : 1.0,
  });

  return atom.id;
}

/**
 * Capture outcome signals for a task and persist as a base atom.
 */
export function captureOutcome(
  store: AtomStore,
  taskId: string,
  signals: OutcomeSignals,
): string {
  // Score using PRD v1 weights:
  // completion without error (0.3), no revisit within 1hr (0.2),
  // human acceptance (0.3), convergence speed (0.1), error-free (0.1)
  const score =
    (signals.completed_without_error ? 0.3 : 0) +
    (!signals.revisited_within_1hr ? 0.2 : 0) +
    (signals.human_accepted === true ? 0.3 : signals.human_accepted === null ? 0.15 : 0) +
    Math.max(0, 0.1 * (1 - signals.convergence_steps / 20)) +
    (signals.error_free ? 0.1 : 0);

  const atom = store.createAtom({
    type: 'context',
    observation: `Task ${taskId} outcome: score=${score.toFixed(3)}`,
    context: JSON.stringify(signals),
    confidence: score,
    fitness_score: score,
    trust_tier: 'local',
    source_agent_hash: 'local',
    decay_rate: 0.99,
  });

  return atom.id;
}
