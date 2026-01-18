/**
 * Aggregation module for Stage 4: Evaluation.
 *
 * This module contains utilities for building and aggregating evaluation results.
 * - scenario-results.ts: Build individual evaluation results
 * - batch-results.ts: Aggregate multi-sample batch results
 * - types.ts: Shared type definitions
 */

// Re-export types
export type {
  EvaluationContext,
  JudgeStrategy,
  ProgrammaticResult,
  ScenarioEvaluationResult,
} from "./types.js";

// Re-export functions
export {
  buildEvaluationResult,
  buildFinalResult,
  judgeResponseToMultiSample,
} from "./scenario-results.js";

export { aggregateBatchResults } from "./batch-results.js";
