/**
 * State update operations.
 *
 * Pure functions for updating pipeline state after each stage.
 * All functions return new state objects without mutating inputs.
 * Callers are responsible for persisting state via saveState().
 */

import type { PipelineState } from "./types.js";
import type { EvaluationResult } from "../types/evaluation.js";
import type { TestScenario } from "../types/scenario.js";
import type { AnalysisOutput } from "../types/state.js";
import type { ExecutionResult } from "../types/transcript.js";

/**
 * Update state after completing analysis stage.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param analysis - Analysis output
 * @returns Updated state (not persisted)
 */
export function updateStateAfterAnalysis(
  state: PipelineState,
  analysis: AnalysisOutput,
): PipelineState {
  return {
    ...state,
    stage: "analysis",
    analysis,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update state after completing generation stage.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param scenarios - Generated scenarios
 * @returns Updated state (not persisted)
 */
export function updateStateAfterGeneration(
  state: PipelineState,
  scenarios: TestScenario[],
): PipelineState {
  return {
    ...state,
    stage: "generation",
    scenarios,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update state after completing execution stage.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param executions - Execution results
 * @returns Updated state (not persisted)
 */
export function updateStateAfterExecution(
  state: PipelineState,
  executions: ExecutionResult[],
): PipelineState {
  // Identify failed scenarios for fast mode
  const failedIds = executions
    .filter((e) => e.errors.length > 0)
    .map((e) => e.scenario_id);

  // Create base update without optional properties set to undefined
  const base = {
    ...state,
    stage: "execution" as const,
    executions,
    timestamp: new Date().toISOString(),
  };

  // Only add failed_scenario_ids if there are failures
  const updated: PipelineState =
    failedIds.length > 0 ? { ...base, failed_scenario_ids: failedIds } : base;

  // Remove partial_executions using destructuring (safer than delete with type cast)
  const { partial_executions: _unusedPartial, ...cleanState } =
    updated as PipelineState & { partial_executions?: unknown };
  return cleanState as PipelineState;
}

/**
 * Update state after completing evaluation stage.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param evaluations - Evaluation results
 * @returns Updated state (not persisted)
 */
export function updateStateAfterEvaluation(
  state: PipelineState,
  evaluations: EvaluationResult[],
): PipelineState {
  const updated: PipelineState = {
    ...state,
    stage: "evaluation",
    evaluations,
    timestamp: new Date().toISOString(),
  };

  // Remove partial_evaluations using destructuring (safer than delete with type cast)
  const { partial_evaluations: _unusedPartial, ...cleanState } =
    updated as PipelineState & { partial_evaluations?: unknown };
  return cleanState as PipelineState;
}

/**
 * Mark pipeline as complete.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @returns Updated state (not persisted)
 */
export function updateStateComplete(state: PipelineState): PipelineState {
  return {
    ...state,
    stage: "complete",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update state with partial execution results.
 *
 * Used for checkpointing during long execution runs.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param partials - Partial execution results
 * @returns Updated state (not persisted)
 */
export function updateStateWithPartialExecutions(
  state: PipelineState,
  partials: ExecutionResult[],
): PipelineState {
  return {
    ...state,
    partial_executions: partials,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update state with error.
 *
 * Note: This is a pure function - caller is responsible for persisting state via saveState().
 *
 * @param state - Current state
 * @param error - Error message
 * @returns Updated state (not persisted)
 */
export function updateStateWithError(
  state: PipelineState,
  error: string,
): PipelineState {
  return {
    ...state,
    error,
    timestamp: new Date().toISOString(),
  };
}
