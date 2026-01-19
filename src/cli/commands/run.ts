/**
 * Run command - Full evaluation pipeline.
 */

import {
  loadConfigWithOverrides,
  extractCLIOptions,
} from "../../config/index.js";
import { runAnalysis } from "../../stages/1-analysis/index.js";
import {
  runGeneration,
  writeGenerationMetadata,
} from "../../stages/2-generation/index.js";
import {
  runExecution,
  consoleProgress,
} from "../../stages/3-execution/index.js";
import { runEvaluation } from "../../stages/4-evaluation/index.js";
import {
  createPipelineState,
  loadState,
  saveState,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  getFailedScenarios,
} from "../../state/index.js";
import {
  logger,
  writeJson,
  getResultsDir,
  generateRunId,
} from "../../utils/index.js";
import { outputFinalSummary } from "../formatters.js";
import { extractConfigPath, handleCLIError } from "../helpers.js";

import type { Command } from "commander";

/**
 * Register the run command on the program.
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run full evaluation pipeline")
    // Input Options Group
    .optionsGroup("Input Options:")
    .option("-p, --plugin <path>", "Path to plugin directory")
    .option("-c, --config <path>", "Path to config file (default: config.yaml)")
    .option("--marketplace <path>", "Evaluate all plugins in marketplace")
    // Execution Mode Group (with v13.1 dual long flag aliases)
    .optionsGroup("Execution Mode:")
    .option("--dr, --dry-run", "Generate scenarios without execution")
    .option("--fast", "Only run previously failed scenarios")
    .option("--failed-run <id>", "Run ID to get failed scenarios from")
    .option("--no-batch", "Force synchronous execution")
    .option("--rewind", "Undo file changes after each scenario")
    .option("--est, --estimate", "Show cost estimate before execution")
    // Output Options Group
    .optionsGroup("Output Options:")
    .option("-o, --output <format>", "Output format: json|yaml|junit-xml|tap")
    .option("-v, --verbose", "Detailed progress output")
    .option("--debug", "Enable debug output")
    // Testing Options Group
    .optionsGroup("Testing Options:")
    .option(
      "--with-plugins <paths>",
      "Additional plugins for conflict testing (comma-separated)",
    )
    .option("--semantic", "Enable semantic variation testing")
    .option(
      "--samples <n>",
      "Number of samples for multi-sample judgment",
      parseInt,
    )
    .option("--reps <n>", "Number of repetitions per scenario", parseInt)
    .action(async (options: Record<string, unknown>) => {
      try {
        const cliOptions = extractCLIOptions(options);
        const configPath = extractConfigPath(options, "config.yaml");
        const config = loadConfigWithOverrides(configPath, cliOptions);

        if (config.verbose) {
          logger.configure({ level: "debug" });
        }

        logger.info("Starting cc-plugin-eval...");

        // Generate run ID and create initial state
        const runId = generateRunId();

        // Stage 1: Analysis
        const analysis = await runAnalysis(config);
        let state = createPipelineState({
          pluginName: analysis.plugin_name,
          config,
          runId,
        });
        state = updateStateAfterAnalysis(state, analysis);
        await saveState(state);

        const resultsDir = getResultsDir(analysis.plugin_name, runId);
        writeJson(`${resultsDir}/analysis.json`, analysis);
        logger.success(`Analysis saved to ${resultsDir}/analysis.json`);

        // Stage 2: Generation
        const generation = await runGeneration(analysis, config);
        state = updateStateAfterGeneration(state, generation.scenarios);
        await saveState(state);

        writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);
        writeGenerationMetadata(resultsDir, generation);
        logger.success(`Scenarios saved to ${resultsDir}/scenarios.json`);

        // Check if dry_run mode - stop after generation
        if (config.dry_run) {
          logger.info("Dry-run mode: stopping after generation");
          return;
        }

        // Determine scenarios to run (support fast mode)
        let scenariosToRun = generation.scenarios;

        if (config.fast_mode?.enabled && config.fast_mode.failed_run_id) {
          // Fast mode: only run previously failed scenarios
          const previousState = loadState(
            analysis.plugin_name,
            config.fast_mode.failed_run_id,
          );
          if (previousState) {
            scenariosToRun = getFailedScenarios(
              previousState,
              generation.scenarios,
            );
            logger.info(
              `Fast mode: running ${String(scenariosToRun.length)} failed scenarios`,
            );
          }
        }

        // Stage 3: Execution
        const execution = await runExecution(
          analysis,
          scenariosToRun,
          config,
          consoleProgress,
        );
        state = updateStateAfterExecution(state, execution.results);
        await saveState(state);

        writeJson(`${resultsDir}/execution-metadata.json`, {
          timestamp: new Date().toISOString(),
          plugin_name: execution.plugin_name,
          total_cost_usd: execution.total_cost_usd,
          total_duration_ms: execution.total_duration_ms,
          success_count: execution.success_count,
          error_count: execution.error_count,
          total_tools_captured: execution.total_tools_captured,
        });

        // Stage 4: Evaluation
        const evaluation = await runEvaluation(
          analysis.plugin_name,
          scenariosToRun,
          execution.results,
          config,
          consoleProgress,
        );
        state = updateStateAfterEvaluation(state, evaluation.results);
        await saveState(state);

        writeJson(`${resultsDir}/evaluation.json`, {
          timestamp: new Date().toISOString(),
          plugin_name: evaluation.plugin_name,
          metrics: evaluation.metrics,
          results: evaluation.results,
        });

        // Mark as complete
        state = updateStateComplete(state);
        await saveState(state);

        // Output final summary
        outputFinalSummary(resultsDir, evaluation.metrics);

        logger.success("Evaluation complete!");
      } catch (err) {
        handleCLIError(err);
      }
    });
}
