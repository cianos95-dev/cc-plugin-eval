/**
 * Generate command - Stages 1-2: Analysis and Scenario Generation.
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
  logger,
  writeJson,
  getResultsDir,
  generateRunId,
} from "../../utils/index.js";
import { extractConfigPath, handleCLIError } from "../helpers.js";

import type { Command } from "commander";

/**
 * Register the generate command on the program.
 */
export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Run Stages 1-2: Analysis and Scenario Generation")
    .optionsGroup("Input Options:")
    .option("-p, --plugin <path>", "Path to plugin directory")
    .option("-c, --config <path>", "Path to config file (default: config.yaml)")
    .optionsGroup("Testing Options:")
    .option("--verbose", "Detailed progress output")
    .option("--semantic", "Generate prompt variations to test robustness")
    .addHelpText(
      "after",
      `
Examples:
  $ cc-plugin-eval generate -p ./my-plugin
  $ cc-plugin-eval generate -p ./my-plugin --semantic --verbose
`,
    )
    .action(async (options: Record<string, unknown>) => {
      try {
        const cliOptions = extractCLIOptions(options);
        const configPath = extractConfigPath(options);
        const config = loadConfigWithOverrides(configPath, cliOptions);

        // Ensure dry_run is false for generate command since we always generate scenarios
        config.dry_run = false;

        if (config.verbose) {
          logger.configure({ level: "debug" });
        }

        const runId = generateRunId();

        // Stage 1: Analysis
        const analysis = await runAnalysis(config);

        const resultsDir = getResultsDir(analysis.plugin_name, runId);
        writeJson(`${resultsDir}/analysis.json`, analysis);
        logger.success(`Analysis saved to ${resultsDir}/analysis.json`);

        // Stage 2: Generation
        const generation = await runGeneration(analysis, config);

        writeJson(`${resultsDir}/scenarios.json`, generation.scenarios);
        writeGenerationMetadata(resultsDir, generation);

        logger.success(
          `Generated ${String(generation.scenarios.length)} scenarios`,
        );
        logger.success(`Scenarios saved to ${resultsDir}/scenarios.json`);
      } catch (err) {
        handleCLIError(err);
      }
    });
}
