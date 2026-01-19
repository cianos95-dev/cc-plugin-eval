/**
 * State management type definitions.
 *
 * Shared types used across state management modules.
 */

import type { EvalConfig } from "../types/config.js";
import type { EvaluationResult } from "../types/evaluation.js";
import type { TestScenario } from "../types/scenario.js";
import type { AnalysisOutput } from "../types/state.js";
import type { ExecutionResult } from "../types/transcript.js";

/**
 * Pipeline stage identifiers.
 */
export type PipelineStage =
  | "pending"
  | "analysis"
  | "generation"
  | "execution"
  | "evaluation"
  | "complete";

/**
 * Pipeline state stored between runs.
 *
 * Contains all intermediate outputs needed to resume from any stage.
 */
export interface PipelineState {
  /** Unique identifier for this run */
  run_id: string;

  /** Plugin name being evaluated */
  plugin_name: string;

  /** Current stage (last completed) */
  stage: PipelineStage;

  /** Timestamp of last state update */
  timestamp: string;

  /** Configuration used for this run */
  config: EvalConfig;

  /** Stage 1 output (if completed) */
  analysis?: AnalysisOutput;

  /** Stage 2 output (if completed) */
  scenarios?: TestScenario[];

  /** Stage 3 output (if completed) */
  executions?: ExecutionResult[];

  /** Stage 4 output (if completed) */
  evaluations?: EvaluationResult[];

  /** Partial execution results for resume */
  partial_executions?: ExecutionResult[];

  /** Partial evaluation results for resume */
  partial_evaluations?: EvaluationResult[];

  /** Scenario IDs that failed (for fast mode) */
  failed_scenario_ids?: string[];

  /** Error message if pipeline failed */
  error?: string;
}

/**
 * Options for creating a new pipeline run.
 */
export interface CreateRunOptions {
  pluginName: string;
  config: EvalConfig;
  runId?: string;
}
