/**
 * Calculate fitness for a single atom using the PRD formula:
 *   fitness = usage_rate × success_ratio × recency_factor
 *
 * - usage_rate = use_count / max(1, max_use_count_across_all)  — normalized
 * - success_ratio = success_after_use / max(1, success_after_use + failure_after_use)
 * - recency_factor = exp(-λ × days_since_last_use), λ = 0.05
 */
export function computeFitness(useCount, successAfterUse, failureAfterUse, lastUsed, maxUseCount, now = new Date()) {
    const usageRate = maxUseCount > 0 ? useCount / maxUseCount : 0;
    const total = successAfterUse + failureAfterUse;
    const successRatio = total > 0 ? successAfterUse / total : 0.5; // neutral if unused
    const daysSinceUse = lastUsed
        ? Math.max(0, (now.getTime() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24))
        : 30; // default to 30 days if never used
    const lambda = 0.05;
    const recencyFactor = Math.exp(-lambda * daysSinceUse);
    return Math.min(1, Math.max(0, usageRate * successRatio * recencyFactor));
}
/**
 * Batch-recalculate fitness for all atoms in the store.
 */
export function recalculateFitness(store) {
    const atoms = store.getAll();
    // Find max use_count for normalization
    let maxUseCount = 1;
    for (const atom of atoms) {
        const uc = atom.use_count ?? 0;
        if (uc > maxUseCount)
            maxUseCount = uc;
    }
    const now = new Date();
    for (const atom of atoms) {
        const a = atom;
        const score = computeFitness(a.use_count ?? 0, a.success_after_use ?? 0, a.failure_after_use ?? 0, a.last_used ?? null, maxUseCount, now);
        store.updateFitnessScore(atom.id, score);
    }
}
//# sourceMappingURL=index.js.map