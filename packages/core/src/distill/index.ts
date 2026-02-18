import type { KnowledgeAtom } from '../types/index.js';

// ── ToolTrace type ───────────────────────────────────────────
export interface ToolTrace {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  error: string | null;
  latencyMs: number;
  outcome: 'success' | 'failure' | 'partial';
  agentId: string;
  timestamp: string; // ISO-8601
}

// ── Distill function type ────────────────────────────────────
export type DistillFn = (trace: ToolTrace) => Promise<KnowledgeAtom | null>;

/**
 * Stub distillation — returns null. Will be replaced with LLM call later.
 */
export async function distillTrace(_trace: ToolTrace): Promise<KnowledgeAtom | null> {
  // Stub: actual LLM distillation will be implemented in a later phase
  return null;
}

// ── BatchDistiller ───────────────────────────────────────────
export class BatchDistiller {
  private buffer: ToolTrace[] = [];
  private readonly batchSize: number;
  private readonly distillFn: DistillFn;

  constructor(options?: { batchSize?: number; distillFn?: DistillFn }) {
    this.batchSize = options?.batchSize ?? 10;
    this.distillFn = options?.distillFn ?? distillTrace;
  }

  /** Add a trace to the buffer. Returns true if batch is full. */
  add(trace: ToolTrace): boolean {
    this.buffer.push(trace);
    return this.buffer.length >= this.batchSize;
  }

  /** Number of pending traces */
  get pending(): number {
    return this.buffer.length;
  }

  /** Check if batch is ready to process */
  get ready(): boolean {
    return this.buffer.length >= this.batchSize;
  }

  /** Flush and process the current batch. Returns distilled atoms (nulls filtered). */
  async flush(): Promise<KnowledgeAtom[]> {
    const batch = this.buffer.splice(0);
    const results = await Promise.all(batch.map(t => this.distillFn(t)));
    return results.filter((a): a is KnowledgeAtom => a !== null);
  }

  /** Drain all traces without processing */
  drain(): ToolTrace[] {
    return this.buffer.splice(0);
  }
}
