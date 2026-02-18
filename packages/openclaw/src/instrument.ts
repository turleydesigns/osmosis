import { captureToolCall, type AtomStore } from '@osmosis/core';

export interface ToolCallFn {
  (toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

/**
 * Wrap a tool execution function to automatically capture calls in Osmosis.
 * Returns a new function with the same signature that records tool name, params,
 * result, error, and latency.
 */
export function instrumentToolCall(
  originalFn: ToolCallFn,
  store: AtomStore,
): ToolCallFn {
  return async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
    const start = performance.now();
    let result: unknown;
    let error: string | null = null;

    try {
      result = await originalFn(toolName, params);
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const latencyMs = Math.round(performance.now() - start);
      captureToolCall(store, toolName, params, result, error, latencyMs);
    }
  };
}
