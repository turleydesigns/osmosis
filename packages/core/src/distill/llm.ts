/**
 * LLM-powered distillation — turns raw tool traces into actionable knowledge atoms.
 * 
 * Groups related traces (same tool, similar errors) and asks an LLM to extract
 * patterns, best practices, and failure workarounds.
 */

import type { KnowledgeAtom, CreateToolAtom, CreateNegativeAtom } from '../types/index.js';
import type { ToolTrace } from './index.js';
import { createHash } from 'node:crypto';

export interface LLMDistillConfig {
  /** API endpoint (OpenAI-compatible) */
  apiUrl: string;
  /** API key */
  apiKey: string;
  /** Model to use (default: gpt-4o-mini for cost efficiency) */
  model: string;
  /** Minimum traces before distillation (default: 5) */
  minTraces: number;
  /** Max tokens for response */
  maxTokens: number;
}

export const DEFAULT_LLM_CONFIG: LLMDistillConfig = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
  minTraces: 5,
  maxTokens: 1024,
};

const DISTILL_PROMPT = `You are a knowledge distillation engine for AI agents. You analyze tool call traces and extract reusable operational knowledge.

Given a batch of tool call traces (tool name, parameters, outcomes, errors), extract knowledge atoms:

Rules:
- Each atom must be a single, actionable insight an agent can use
- Focus on: failure patterns, parameter best practices, timing tips, error workarounds
- Skip trivial observations ("tool X works" is not useful)
- Be specific and concise (1-2 sentences max per observation)
- Include the error signature when relevant

Output JSON array of atoms:
[
  {
    "kind": "tool" | "negative",
    "tool_name": "string",
    "observation": "string (the insight)",
    "confidence": 0.0-1.0,
    "error_signature": "string | null",
    "anti_pattern": "string | null (for negative atoms)"
  }
]

If no meaningful patterns exist, return [].`;

interface DistilledAtom {
  kind: 'tool' | 'negative';
  tool_name: string;
  observation: string;
  confidence: number;
  error_signature: string | null;
  anti_pattern: string | null;
}

/**
 * Group traces by tool name for batched distillation.
 */
export function groupTraces(traces: ToolTrace[]): Map<string, ToolTrace[]> {
  const groups = new Map<string, ToolTrace[]>();
  for (const trace of traces) {
    const key = trace.toolName;
    const existing = groups.get(key) ?? [];
    existing.push(trace);
    groups.set(key, existing);
  }
  return groups;
}

/**
 * Summarize traces for the LLM prompt (strip large payloads).
 */
function summarizeTraces(traces: ToolTrace[]): string {
  return traces.map((t, i) => {
    const params = Object.keys(t.params).join(', ');
    const resultSnippet = t.result 
      ? String(t.result).slice(0, 150).replace(/\n/g, ' ')
      : 'null';
    const errorSnippet = t.error ? t.error.slice(0, 150) : 'none';
    return `[${i + 1}] ${t.toolName}(${params}) → ${t.outcome} | error: ${errorSnippet} | result: ${resultSnippet} | ${t.latencyMs}ms`;
  }).join('\n');
}

/**
 * Call an OpenAI-compatible API to distill traces.
 */
export async function llmDistill(
  traces: ToolTrace[],
  config: LLMDistillConfig,
): Promise<DistilledAtom[]> {
  if (traces.length < config.minTraces) return [];
  if (!config.apiKey) return [];

  const summary = summarizeTraces(traces);
  
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: DISTILL_PROMPT },
          { role: 'user', content: `Analyze these ${traces.length} tool call traces:\n\n${summary}` },
        ],
        max_tokens: config.maxTokens,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.error(`LLM distill failed: ${res.status} ${await res.text()}`);
      return [];
    }

    const body = await res.json() as any;
    const content = body.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const atoms = Array.isArray(parsed) ? parsed : parsed.atoms ?? [];
    
    return atoms.filter((a: any) => 
      a.observation && typeof a.observation === 'string' && a.observation.length > 10
    );
  } catch (err) {
    console.error(`LLM distill error: ${err}`);
    return [];
  }
}

/**
 * Convert distilled atoms to store-ready format.
 */
export function toCreateAtoms(
  distilled: DistilledAtom[],
  agentHash: string = 'distiller',
): Array<CreateToolAtom | CreateNegativeAtom> {
  return distilled.map(d => {
    const base = {
      observation: d.observation,
      context: JSON.stringify({ source: 'llm-distillation', tool: d.tool_name }),
      confidence: d.confidence,
      fitness_score: d.confidence * 0.9, // Slightly lower than confidence
      trust_tier: 'local' as const,
      source_agent_hash: agentHash,
      decay_rate: 0.99,
    };

    if (d.kind === 'negative' && d.anti_pattern) {
      return {
        ...base,
        type: 'negative' as const,
        anti_pattern: d.anti_pattern,
        failure_cluster_size: 1,
        error_type: d.error_signature ?? 'unknown',
        severity: d.confidence > 0.8 ? 'high' as const : 'medium' as const,
      };
    }

    return {
      ...base,
      type: 'tool' as const,
      tool_name: d.tool_name,
      params_hash: createHash('sha256').update(d.observation).digest('hex').slice(0, 16),
      outcome: d.error_signature ? 'failure' as const : 'success' as const,
      error_signature: d.error_signature,
      latency_ms: null,
      reliability_score: d.error_signature ? 0.3 : 0.8,
    };
  });
}
