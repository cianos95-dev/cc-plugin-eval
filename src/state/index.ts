/**
 * State Management
 *
 * Provides checkpoint and resume capability for the evaluation pipeline.
 * State is saved after each stage to enable recovery from interruptions.
 *
 * Features:
 * - Save state after each pipeline stage
 * - Resume from any saved stage
 * - Track partial execution results
 * - Fast mode: only re-run failed scenarios
 *
 * This module re-exports all state management functionality from focused submodules:
 * - types: Shared type definitions (PipelineState, PipelineStage, etc.)
 * - core: CRUD operations (create, save, load, paths)
 * - updates: State update functions (updateStateAfter*, etc.)
 * - queries: Query helpers (canResumeFrom, get*Scenarios, etc.)
 * - display: Formatting and listing (formatState, listRuns)
 */

// Re-export types
export type {
  CreateRunOptions,
  PipelineStage,
  PipelineState,
  ResumeOptions,
} from "./types.js";

// Re-export core operations
export {
  createPipelineState,
  findLatestRun,
  generateRunId,
  getStateFilePath,
  loadState,
  saveState,
} from "./core.js";

// Re-export update operations
export {
  updateStateAfterAnalysis,
  updateStateAfterEvaluation,
  updateStateAfterExecution,
  updateStateAfterGeneration,
  updateStateComplete,
  updateStateWithError,
  updateStateWithPartialExecutions,
} from "./updates.js";

// Re-export query operations
export {
  canResumeFrom,
  getFailedScenarios,
  getIncompleteScenarios,
  getNextStage,
} from "./queries.js";

// Re-export display operations
export type { RunSummary } from "./display.js";
export { formatState, listRuns } from "./display.js";
