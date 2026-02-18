import type { AtomStore } from '../store/index.js';

/**
 * Seed the store with 15 realistic knowledge atoms from common OpenClaw agent experiences.
 */
export function seedAtoms(store: AtomStore): void {
  // 1. browser.screenshot fails on lazy-loaded pages
  store.createToolAtom({
    type: 'tool',
    observation: 'browser.screenshot fails on lazy-loaded pages — images appear blank. Add a 2s delay or scroll first to trigger loading.',
    context: JSON.stringify({ tool: 'browser.screenshot', workaround: 'delay 2000ms or scroll to trigger lazy load' }),
    confidence: 0.9, fitness_score: 0.85, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'browser.screenshot', params_hash: 'seed',
    outcome: 'failure', error_signature: 'blank screenshot on lazy-loaded content', latency_ms: 3200, reliability_score: 0.4,
  });

  // 2. exec with long-running commands needs timeout
  store.createToolAtom({
    type: 'tool',
    observation: 'exec commands that run >60s will be killed by default timeout. Always pass explicit timeout parameter for builds, tests, or installs.',
    context: JSON.stringify({ tool: 'exec', tip: 'set timeout: 120+ for npm install, builds' }),
    confidence: 0.95, fitness_score: 0.9, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'exec', params_hash: 'seed',
    outcome: 'failure', error_signature: 'process killed by timeout', latency_ms: 60000, reliability_score: 0.3,
  });

  // 3. web_fetch returns truncated content
  store.createToolAtom({
    type: 'tool',
    observation: 'web_fetch returns truncated content for pages >50KB. Use maxChars parameter or fetch specific sections with CSS selectors.',
    context: JSON.stringify({ tool: 'web_fetch', limit: '50KB default' }),
    confidence: 0.85, fitness_score: 0.8, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'web_fetch', params_hash: 'seed',
    outcome: 'partial', error_signature: null, latency_ms: 2500, reliability_score: 0.6,
  });

  // 4. API rate limiting
  store.createNegativeAtom({
    type: 'negative',
    observation: 'Calling external APIs without rate limiting causes retry storms — exponential backoff quickly burns through quotas.',
    context: JSON.stringify({ pattern: 'retry storm', fix: 'add exponential backoff with jitter' }),
    confidence: 0.9, fitness_score: 0.85, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, anti_pattern: 'unbounded API retries without backoff',
    failure_cluster_size: 5, error_type: 'rate_limit_exceeded', severity: 'high',
  });

  // 5. git push without pull
  store.createNegativeAtom({
    type: 'negative',
    observation: 'git push without pulling first causes force-push disasters when remote has diverged. Always git pull --rebase before push.',
    context: JSON.stringify({ pattern: 'force push', fix: 'git pull --rebase origin <branch> first' }),
    confidence: 0.95, fitness_score: 0.9, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, anti_pattern: 'git push without checking remote state',
    failure_cluster_size: 3, error_type: 'rejected_non_fast_forward', severity: 'critical',
  });

  // 6. browser.navigate needs network idle
  store.createToolAtom({
    type: 'tool',
    observation: 'browser.navigate often returns before page is fully loaded. Wait for network idle or a specific element before interacting.',
    context: JSON.stringify({ tool: 'browser.navigate', tip: 'use snapshot after navigate to confirm load' }),
    confidence: 0.85, fitness_score: 0.8, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'browser.navigate', params_hash: 'seed',
    outcome: 'partial', error_signature: null, latency_ms: 1500, reliability_score: 0.5,
  });

  // 7. Agent iteration pattern
  store.createAtom({
    type: 'pattern',
    observation: 'When an agent iterates more than 3 times on the same approach, it usually means the approach is wrong. Step back and try a different strategy.',
    context: JSON.stringify({ threshold: 3, action: 'change approach' }),
    confidence: 0.8, fitness_score: 0.75, trust_tier: 'local', source_agent_hash: 'seed', decay_rate: 0.99,
  });

  // 8. Playwright vs Puppeteer
  store.createAtom({
    type: 'context',
    observation: 'Playwright is faster than Puppeteer for parallel page loads and has better auto-waiting. Prefer it for browser automation tasks.',
    context: JSON.stringify({ comparison: 'playwright > puppeteer for parallel' }),
    confidence: 0.7, fitness_score: 0.65, trust_tier: 'local', source_agent_hash: 'seed', decay_rate: 0.99,
  });

  // 9. File read with offset for large files
  store.createToolAtom({
    type: 'tool',
    observation: 'Read tool truncates at 2000 lines or 50KB. For large files, use offset/limit parameters to paginate through content.',
    context: JSON.stringify({ tool: 'Read', tip: 'use offset to continue reading' }),
    confidence: 0.9, fitness_score: 0.85, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'Read', params_hash: 'seed',
    outcome: 'success', error_signature: null, latency_ms: 50, reliability_score: 0.9,
  });

  // 10. TypeScript project references
  store.createAtom({
    type: 'context',
    observation: 'In monorepos with TypeScript project references, build packages in dependency order. Core before dependent packages.',
    context: JSON.stringify({ tip: 'tsc --build for composite projects' }),
    confidence: 0.85, fitness_score: 0.8, trust_tier: 'local', source_agent_hash: 'seed', decay_rate: 0.99,
  });

  // 11. exec command chaining
  store.createToolAtom({
    type: 'tool',
    observation: 'Use && to chain exec commands rather than separate calls — reduces latency and ensures sequential execution with early exit on failure.',
    context: JSON.stringify({ tool: 'exec', tip: 'chain with && for atomic operations' }),
    confidence: 0.8, fitness_score: 0.75, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'exec', params_hash: 'seed-chain',
    outcome: 'success', error_signature: null, latency_ms: 100, reliability_score: 0.9,
  });

  // 12. Don't rm -rf without confirmation
  store.createNegativeAtom({
    type: 'negative',
    observation: 'Never use rm -rf on user directories without explicit confirmation. Use trash command or move to temp location first.',
    context: JSON.stringify({ pattern: 'destructive delete', fix: 'use trash or ask first' }),
    confidence: 0.95, fitness_score: 0.95, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, anti_pattern: 'rm -rf without confirmation',
    failure_cluster_size: 2, error_type: 'data_loss', severity: 'critical',
  });

  // 13. browser snapshot refs
  store.createToolAtom({
    type: 'tool',
    observation: 'browser.snapshot refs change between calls. Always take a fresh snapshot before clicking — stale refs cause "element not found" errors.',
    context: JSON.stringify({ tool: 'browser.snapshot', tip: 'snapshot immediately before act' }),
    confidence: 0.9, fitness_score: 0.85, trust_tier: 'local', source_agent_hash: 'seed',
    decay_rate: 0.99, tool_name: 'browser.snapshot', params_hash: 'seed',
    outcome: 'failure', error_signature: 'element ref not found', latency_ms: 200, reliability_score: 0.5,
  });

  // 14. JSON parse errors in web_fetch
  store.createAtom({
    type: 'pattern',
    observation: 'When web_fetch returns markdown, don\'t try to JSON.parse it. Check content type first or wrap in try/catch with fallback.',
    context: JSON.stringify({ pattern: 'content type mismatch' }),
    confidence: 0.8, fitness_score: 0.75, trust_tier: 'local', source_agent_hash: 'seed', decay_rate: 0.99,
  });

  // 15. Vitest vs Jest in ESM projects
  store.createAtom({
    type: 'context',
    observation: 'Vitest works natively with ESM and TypeScript. Jest requires extensive configuration for ESM. Use Vitest for modern TS projects.',
    context: JSON.stringify({ comparison: 'vitest > jest for ESM+TS' }),
    confidence: 0.75, fitness_score: 0.7, trust_tier: 'local', source_agent_hash: 'seed', decay_rate: 0.99,
  });
}
