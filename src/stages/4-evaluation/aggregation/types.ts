/**
 * Aggregation types for Stage 4: Evaluation.
 *
 * These interfaces are used across the aggregation module to build
 * and combine evaluation results.
 */

import type {
  DetectionSource,
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../../../types/index.js";
import type { calculateConflictSeverity } from "../conflict-tracker.js";
import type { getUniqueDetections } from "../detection/index.js";

/**
 * Scenario evaluation context.
 */
export interface EvaluationContext {
  scenario: TestScenario;
  execution: ExecutionResult;
}

/**
 * Result of judge strategy determination.
 */
export interface JudgeStrategy {
  needsLLMJudge: boolean;
  detectionSource: DetectionSource;
}

/**
 * Intermediate result from programmatic detection phase.
 */
export interface ProgrammaticResult {
  context: EvaluationContext;
  uniqueDetections: ReturnType<typeof getUniqueDetections>;
  triggered: boolean;
  conflictAnalysis: ReturnType<typeof calculateConflictSeverity>;
  judgeStrategy: JudgeStrategy;
}

/**
 * Result from evaluating a single scenario.
 * Includes both the evaluation result and variance/consensus for metrics.
 */
export interface ScenarioEvaluationResult {
  result: EvaluationResult;
  variance: number;
  /** Whether all samples agreed on trigger_accuracy */
  isUnanimous: boolean;
}
