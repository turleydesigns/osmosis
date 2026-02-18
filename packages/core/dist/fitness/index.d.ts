import type { AtomStore } from '../store/index.js';
/**
 * Calculate fitness for a single atom using the PRD formula:
 *   fitness = usage_rate × success_ratio × recency_factor
 *
 * - usage_rate = use_count / max(1, max_use_count_across_all)  — normalized
 * - success_ratio = success_after_use / max(1, success_after_use + failure_after_use)
 * - recency_factor = exp(-λ × days_since_last_use), λ = 0.05
 */
export declare function computeFitness(useCount: number, successAfterUse: number, failureAfterUse: number, lastUsed: string | null, maxUseCount: number, now?: Date): number;
/**
 * Batch-recalculate fitness for all atoms in the store.
 */
export declare function recalculateFitness(store: AtomStore): void;
