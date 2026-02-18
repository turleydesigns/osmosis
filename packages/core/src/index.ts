// Types
export type {
  KnowledgeAtom,
  ToolAtom,
  NegativeAtom,
  PatternAtom,
  SkillAtom,
  ContextAtom,
  AnyAtom,
  OutcomeSignals,
  CreateAtom,
  CreateToolAtom,
  CreateNegativeAtom,
  AtomType,
  TrustTier,
  Outcome,
  Severity,
} from './types/index.js';

// Store
export { AtomStore, jaccardSimilarity } from './store/index.js';

// Capture
export { captureToolCall, captureOutcome } from './capture/index.js';

// Validation
export {
  CreateAtomSchema,
  CreateToolAtomSchema,
  CreateNegativeAtomSchema,
  OutcomeSignalsSchema,
  validateCreateAtom,
  validateCreateToolAtom,
  validateCreateNegativeAtom,
} from './validation/index.js';

// Fitness
export { computeFitness, recalculateFitness } from './fitness/index.js';

// API
export { createServer } from './api/index.js';
