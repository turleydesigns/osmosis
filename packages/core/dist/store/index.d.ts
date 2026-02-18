import type { KnowledgeAtom, ToolAtom, NegativeAtom, CreateAtom, CreateToolAtom, CreateNegativeAtom, AtomType } from '../types/index.js';
/**
 * Jaccard similarity between two strings (based on word bigrams).
 */
export declare function jaccardSimilarity(a: string, b: string): number;
export declare class AtomStore {
    private db;
    constructor(dbPath?: string);
    /** Run schema migrations */
    migrate(): void;
    /** Find atoms with similar observation text */
    findSimilar(observation: string, threshold?: number): KnowledgeAtom[];
    /** Insert a base/pattern/skill/context atom (with validation and dedup) */
    createAtom(data: CreateAtom): KnowledgeAtom;
    /** Insert a ToolAtom (with validation and dedup) */
    createToolAtom(data: CreateToolAtom): ToolAtom;
    /** Insert a NegativeAtom (with validation and dedup) */
    createNegativeAtom(data: CreateNegativeAtom): NegativeAtom;
    /** Merge: keep higher fitness, increment evidence_count */
    private _mergeAtom;
    /** Get atom by ID */
    getById(id: string): KnowledgeAtom | null;
    /** Query atoms by type */
    queryByType(type: AtomType): KnowledgeAtom[];
    /** Query tool atoms by tool_name */
    queryByToolName(toolName: string): ToolAtom[];
    /** Query atoms with confidence >= threshold */
    queryByConfidence(threshold: number): KnowledgeAtom[];
    /** Full-text search on observation */
    search(query: string): KnowledgeAtom[];
    /** Update fitness score for a specific atom */
    updateFitnessScore(id: string, newScore: number): void;
    /** Record a usage event */
    recordUsage(id: string, success: boolean): void;
    /** Apply decay: multiply fitness_score by decay_rate for all atoms */
    applyDecay(): number;
    /** Delete atom by ID */
    deleteAtom(id: string): boolean;
    /** Get all atoms */
    getAll(): KnowledgeAtom[];
    /** Close the database */
    close(): void;
}
