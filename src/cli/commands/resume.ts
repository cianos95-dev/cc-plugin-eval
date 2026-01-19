/**
 * Resume command - Resume from saved state.
 */

import { runAnalysis } from "../../stages/1-analysis/index.js";
import { runGeneration } from "../../stages/2-generation/index.js";
import {
  runExecution,
  consoleProgress,
} from "../../stages/3-execution/index.js";
import { runEvaluation } from "../../stages/4-evaluation/index.js";
import {
  type loadState,
  saveState,
  findLatestRun,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  canResumeFrom,
  formatState,
  type PipelineStage,
} from "../../state/index.js";
import { logger, writeJson, getResultsDir } from "../../utils/index.js";
import { findAndLoadState, handleCLIError } from "../helpers.js";
import { extractResumeOptions } from "../options.js";

import type { loadConfigWithOverrides } from "../../config/index.js";
import type { Command } from "commander";

// =============================================================================
// Constants
// =============================================================================

/** Success message displayed after completing resume operations. */
const RESUME_COMPLETE_MESSAGE = "Resume complete!";

// =============================================================================
// Resume Stage Handlers
// =============================================================================

/**
 * Resume from analysis stage (run full pipeline).
 *
 * @internal CLI helper - not part of public API
 */
async function resumeFromAnalysis(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from analysis...");

  const analysis = await runAnalysis(config);
  writeJson(`${resultsDir}/analysis.json`, analysis);

  const generation = await runGeneration(analysis, config);
  writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

  const execution = await runExecution(
    analysis,
    generation.scenarios,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysis.plugin_name,
    generation.scenarios,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterAnalysis(initialState, analysis);
  currentState = updateStateAfterGeneration(currentState, generation.scenarios);
  currentState = updateStateAfterExecution(currentState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  // Persist final state
  await saveState(currentState);

  logger.success(RESUME_COMPLETE_MESSAGE);
  return currentState;
}

/**
 * Resume from generation stage.
 *
 * @internal CLI helper - not part of public API
 */
async function resumeFromGeneration(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from generation...");

  const analysisData = initialState.analysis;
  if (!analysisData) {
    throw new Error("Cannot resume from generation: missing analysis data");
  }

  const generation = await runGeneration(analysisData, config);
  writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

  const execution = await runExecution(
    analysisData,
    generation.scenarios,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    generation.scenarios,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterGeneration(
    initialState,
    generation.scenarios,
  );
  currentState = updateStateAfterExecution(currentState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  // Persist final state
  await saveState(currentState);

  logger.success(RESUME_COMPLETE_MESSAGE);
  return currentState;
}

/**
 * Resume from execution stage.
 *
 * @internal CLI helper - not part of public API
 */
async function resumeFromExecution(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  _resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from execution...");

  const analysisData = initialState.analysis;
  const scenarioData = initialState.scenarios;
  if (!analysisData || !scenarioData) {
    throw new Error(
      "Cannot resume from execution: missing analysis or scenario data",
    );
  }

  const execution = await runExecution(
    analysisData,
    scenarioData,
    config,
    consoleProgress,
  );

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    scenarioData,
    execution.results,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterExecution(initialState, execution.results);
  currentState = updateStateAfterEvaluation(currentState, evaluation.results);
  currentState = updateStateComplete(currentState);

  // Persist final state
  await saveState(currentState);

  logger.success(RESUME_COMPLETE_MESSAGE);
  return currentState;
}

/**
 * Resume from evaluation stage.
 *
 * @internal CLI helper - not part of public API
 */
async function resumeFromEvaluation(
  initialState: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  _resultsDir: string,
): Promise<NonNullable<ReturnType<typeof loadState>>> {
  logger.info("Resuming from evaluation...");

  const analysisData = initialState.analysis;
  const scenarioData = initialState.scenarios;
  const executionData = initialState.executions;
  if (!analysisData || !scenarioData || !executionData) {
    throw new Error(
      "Cannot resume from evaluation: missing analysis, scenario, or execution data",
    );
  }

  const evaluation = await runEvaluation(
    analysisData.plugin_name,
    scenarioData,
    executionData,
    config,
    consoleProgress,
  );

  // Chain state updates
  let currentState = updateStateAfterEvaluation(
    initialState,
    evaluation.results,
  );
  currentState = updateStateComplete(currentState);

  // Persist final state
  await saveState(currentState);

  logger.success(RESUME_COMPLETE_MESSAGE);
  return currentState;
}

/**
 * Stage handler type for resume operations.
 *
 * @internal CLI type - not part of public API
 */
type ResumeHandler = (
  state: NonNullable<ReturnType<typeof loadState>>,
  config: ReturnType<typeof loadConfigWithOverrides>,
  resultsDir: string,
) => Promise<NonNullable<ReturnType<typeof loadState>>>;

/**
 * Map of stages to their resume handlers.
 *
 * @internal CLI constant - not part of public API
 */
const resumeHandlers: Record<PipelineStage, ResumeHandler> = {
  pending: resumeFromAnalysis,
  analysis: resumeFromAnalysis,
  generation: resumeFromGeneration,
  execution: resumeFromExecution,
  evaluation: resumeFromEvaluation,
  complete: resumeFromEvaluation, // Already complete, but handle gracefully
};

/**
 * Resolve and validate run ID from options.
 * Returns the run ID or exits with error.
 */
function resolveRunId(
  runId: string | undefined,
  pluginName: string | undefined,
): string {
  if (runId) {
    return runId;
  }

  if (pluginName) {
    const foundId = findLatestRun(pluginName);
    if (foundId) {
      logger.info(`Found latest run: ${foundId}`);
      return foundId;
    }
    logger.error(`No runs found for plugin: ${pluginName}`);
    process.exit(1);
  }

  logger.error("Please provide --run-id or --plugin to find a run");
  process.exit(1);
}

/**
 * Display available data for resume troubleshooting.
 */
function displayAvailableData(
  state: NonNullable<ReturnType<typeof loadState>>,
): void {
  logger.info("Available data:");
  if (state.analysis) {
    logger.info("  - Analysis complete");
  }
  if (state.scenarios) {
    logger.info("  - Scenarios generated");
  }
  if (state.executions) {
    logger.info("  - Executions complete");
  }
  if (state.evaluations) {
    logger.info("  - Evaluations complete");
  }
}

/**
 * Register the resume command on the program.
 */
export function registerResumeCommand(program: Command): void {
  program
    .command("resume")
    .description("Resume from saved state")
    .option("-r, --run-id <id>", "Run ID to resume")
    .option("-p, --plugin <name>", "Plugin name (for finding run)")
    .option(
      "-s, --from-stage <stage>",
      "Stage to resume from: analysis|generation|execution|evaluation",
    )
    .action(async (options: Record<string, unknown>) => {
      try {
        const extracted = extractResumeOptions(options);
        const { pluginName, fromStage, error } = extracted;

        if (error) {
          logger.error(error);
          process.exit(1);
        }

        const runId = resolveRunId(extracted.runId, pluginName);
        const state = findAndLoadState(pluginName, runId);

        if (!state) {
          logger.error(`No state found for run: ${runId}`);
          process.exit(1);
        }

        logger.info("Current state:");
        console.log(formatState(state));

        const resumeStage = fromStage ?? state.stage;

        if (!canResumeFrom(state, resumeStage)) {
          logger.error(`Cannot resume from stage: ${resumeStage}`);
          displayAvailableData(state);
          process.exit(1);
        }

        const config = state.config;
        if (config.verbose) {
          logger.configure({ level: "debug" });
        }

        const resultsDir = getResultsDir(state.plugin_name, state.run_id);
        const handler = resumeHandlers[resumeStage];
        await handler(state, config, resultsDir);
      } catch (err) {
        handleCLIError(err);
      }
    });
}
