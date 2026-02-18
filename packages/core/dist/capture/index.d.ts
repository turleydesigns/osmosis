import type { OutcomeSignals } from '../types/index.js';
import { AtomStore } from '../store/index.js';
/**
 * Capture a tool call and persist it as a ToolAtom in the local store.
 */
export declare function captureToolCall(store: AtomStore, toolName: string, params: Record<string, unknown>, result: unknown, error?: string | null, latencyMs?: number | null): string;
/**
 * Capture outcome signals for a task and persist as a base atom.
 */
export declare function captureOutcome(store: AtomStore, taskId: string, signals: OutcomeSignals): string;
