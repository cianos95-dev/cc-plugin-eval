/**
 * State query operations.
 *
 * Functions for querying pipeline state and extracting scenario subsets.
 * All functions are pure and side-effect free.
 */

import type { PipelineStage, PipelineState } from "./types.js";
import type { TestScenario } from "../types/index.js";

/**
 * Check if a stage can be resumed from.
 *
 * @param state - Pipeline state
 * @param targetStage - Stage to resume from
 * @returns True if resumable
 */
export function canResumeFrom(
  state: PipelineState,
  targetStage: PipelineStage,
): boolean {
  const stageOrder: PipelineStage[] = [
    "pending",
    "analysis",
    "generation",
    "execution",
    "evaluation",
    "complete",
  ];

  const currentIndex = stageOrder.indexOf(state.stage);
  const targetIndex = stageOrder.indexOf(targetStage);

  // Can resume if current stage is at or after target stage
  // (i.e., we have the data needed to start from target stage)
  if (targetIndex <= currentIndex) {
    // Verify required data exists
    switch (targetStage) {
      case "pending":
        return true;
      case "analysis":
        return true; // Can always re-run analysis
      case "generation":
        return state.analysis !== undefined;
      case "execution":
        return state.analysis !== undefined && state.scenarios !== undefined;
      case "evaluation":
        return (
          state.analysis !== undefined &&
          state.scenarios !== undefined &&
          state.executions !== undefined
        );
      case "complete":
        return state.stage === "complete";
    }
  }

  return false;
}

/**
 * Get the next stage to run.
 *
 * @param currentStage - Current pipeline stage
 * @returns Next stage or null if complete
 */
export function getNextStage(
  currentStage: PipelineStage,
): PipelineStage | null {
  const stageOrder: PipelineStage[] = [
    "pending",
    "analysis",
    "generation",
    "execution",
    "evaluation",
    "complete",
  ];

  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
    return null;
  }

  return stageOrder[currentIndex + 1] ?? null;
}

/**
 * Get scenarios to run for fast mode.
 *
 * Returns only scenarios that failed in the previous run.
 *
 * @param state - Pipeline state from failed run
 * @param allScenarios - All scenarios
 * @returns Failed scenarios to re-run
 */
export function getFailedScenarios(
  state: PipelineState,
  allScenarios: TestScenario[],
): TestScenario[] {
  if (!state.failed_scenario_ids || state.failed_scenario_ids.length === 0) {
    return [];
  }

  const failedIds = new Set(state.failed_scenario_ids);
  return allScenarios.filter((s) => failedIds.has(s.id));
}

/**
 * Get incomplete scenarios for resume.
 *
 * Returns scenarios that weren't executed in partial run.
 *
 * @param state - Pipeline state
 * @param allScenarios - All scenarios
 * @returns Incomplete scenarios
 */
export function getIncompleteScenarios(
  state: PipelineState,
  allScenarios: TestScenario[],
): TestScenario[] {
  const completedIds = new Set<string>();

  // Check both full and partial executions
  if (state.executions) {
    for (const e of state.executions) {
      completedIds.add(e.scenario_id);
    }
  }
  if (state.partial_executions) {
    for (const e of state.partial_executions) {
      completedIds.add(e.scenario_id);
    }
  }

  return allScenarios.filter((s) => !completedIds.has(s.id));
}
