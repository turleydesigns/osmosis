import { z } from 'zod';
export declare const CreateAtomSchema: z.ZodObject<{
    type: z.ZodEnum<{
        tool: "tool";
        negative: "negative";
        pattern: "pattern";
        skill: "skill";
        context: "context";
    }>;
    observation: z.ZodString;
    context: z.ZodString;
    confidence: z.ZodNumber;
    fitness_score: z.ZodNumber;
    trust_tier: z.ZodEnum<{
        quarantine: "quarantine";
        local: "local";
        verified: "verified";
        canonical: "canonical";
    }>;
    source_agent_hash: z.ZodString;
    decay_rate: z.ZodNumber;
}, z.core.$strip>;
export declare const CreateToolAtomSchema: z.ZodObject<{
    observation: z.ZodString;
    context: z.ZodString;
    confidence: z.ZodNumber;
    fitness_score: z.ZodNumber;
    trust_tier: z.ZodEnum<{
        quarantine: "quarantine";
        local: "local";
        verified: "verified";
        canonical: "canonical";
    }>;
    source_agent_hash: z.ZodString;
    decay_rate: z.ZodNumber;
    type: z.ZodLiteral<"tool">;
    tool_name: z.ZodString;
    params_hash: z.ZodString;
    outcome: z.ZodEnum<{
        success: "success";
        failure: "failure";
        partial: "partial";
    }>;
    error_signature: z.ZodNullable<z.ZodString>;
    latency_ms: z.ZodNullable<z.ZodNumber>;
    reliability_score: z.ZodNumber;
}, z.core.$strip>;
export declare const CreateNegativeAtomSchema: z.ZodObject<{
    observation: z.ZodString;
    context: z.ZodString;
    confidence: z.ZodNumber;
    fitness_score: z.ZodNumber;
    trust_tier: z.ZodEnum<{
        quarantine: "quarantine";
        local: "local";
        verified: "verified";
        canonical: "canonical";
    }>;
    source_agent_hash: z.ZodString;
    decay_rate: z.ZodNumber;
    type: z.ZodLiteral<"negative">;
    anti_pattern: z.ZodString;
    failure_cluster_size: z.ZodNumber;
    error_type: z.ZodString;
    severity: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
}, z.core.$strip>;
export declare const OutcomeSignalsSchema: z.ZodObject<{
    completed_without_error: z.ZodBoolean;
    revisited_within_1hr: z.ZodBoolean;
    human_accepted: z.ZodNullable<z.ZodBoolean>;
    convergence_steps: z.ZodNumber;
    error_free: z.ZodBoolean;
}, z.core.$strip>;
/** Validate and return typed data, or throw ZodError */
export declare function validateCreateAtom(data: unknown): {
    type: "tool" | "negative" | "pattern" | "skill" | "context";
    observation: string;
    context: string;
    confidence: number;
    fitness_score: number;
    trust_tier: "quarantine" | "local" | "verified" | "canonical";
    source_agent_hash: string;
    decay_rate: number;
};
export declare function validateCreateToolAtom(data: unknown): {
    observation: string;
    context: string;
    confidence: number;
    fitness_score: number;
    trust_tier: "quarantine" | "local" | "verified" | "canonical";
    source_agent_hash: string;
    decay_rate: number;
    type: "tool";
    tool_name: string;
    params_hash: string;
    outcome: "success" | "failure" | "partial";
    error_signature: string | null;
    latency_ms: number | null;
    reliability_score: number;
};
export declare function validateCreateNegativeAtom(data: unknown): {
    observation: string;
    context: string;
    confidence: number;
    fitness_score: number;
    trust_tier: "quarantine" | "local" | "verified" | "canonical";
    source_agent_hash: string;
    decay_rate: number;
    type: "negative";
    anti_pattern: string;
    failure_cluster_size: number;
    error_type: string;
    severity: "low" | "medium" | "high" | "critical";
};
