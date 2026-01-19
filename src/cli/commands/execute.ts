/**
 * Execute command - Stages 1-3: Analysis, Generation, and Execution.
 */

import {
  loadConfigWithOverrides,
  extractCLIOptions,
} from "../../config/index.js";
import { runAnalysis } from "../../stages/1-analysis/index.js";
import { runGeneration } from "../../stages/2-generation/index.js";
import {
  runExecution,
  consoleProgress,
} from "../../stages/3-execution/index.js";
import {
  createPipelineState,
  saveState,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
} from "../../state/index.js";
import {
  logger,
  writeJson,
  getResultsDir,
  generateRunId,
} from "../../utils/index.js";
import {
  extractConfigPath,
  handleCLIError,
  writeExecutionMetadata,
} from "../helpers.js";

import type { Command } from "commander";

/**
 * Register the execute command on the program.
 */
export function registerExecuteCommand(program: Command): void {
  program
    .command("execute")
    .description("Run Stages 1-3: Analysis, Generation, and Execution")
    .option("-p, --plugin <path>", "Path to plugin directory")
    .option("-c, --config <path>", "Path to config file")
    .option("--verbose", "Detailed progress output")
    .action(async (options: Record<string, unknown>) => {
      try {
        const cliOptions = extractCLIOptions(options);
        const configPath = extractConfigPath(options);
        const config = loadConfigWithOverrides(configPath, cliOptions);

        if (config.verbose) {
          logger.configure({ level: "debug" });
        }

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

        // Stage 2: Generation
        const generation = await runGeneration(analysis, config);
        state = updateStateAfterGeneration(state, generation.scenarios);
        await saveState(state);

        writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);

        // Stage 3: Execution
        const execution = await runExecution(
          analysis,
          generation.scenarios,
          config,
          consoleProgress,
        );
        state = updateStateAfterExecution(state, execution.results);
        await saveState(state);

        writeExecutionMetadata(resultsDir, execution);

        logger.success(
          `Execution complete: ${String(execution.success_count)}/${String(execution.results.length)} passed`,
        );
        logger.success(`Results saved to ${resultsDir}`);
      } catch (err) {
        handleCLIError(err);
      }
    });
}
