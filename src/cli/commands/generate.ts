/**
 * Generate command - Stages 1-2: Analysis and Scenario Generation.
 */

import {
  loadConfigWithOverrides,
  type CLIOptions,
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

import type { Command } from "commander";

/**
 * Register the generate command on the program.
 */
export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Run Stages 1-2: Analysis and Scenario Generation")
    .option("-p, --plugin <path>", "Path to plugin directory")
    .option("-c, --config <path>", "Path to config file")
    .option("--verbose", "Detailed progress output")
    .option("--semantic", "Enable semantic variation testing")
    .action(async (options: Record<string, unknown>) => {
      try {
        const cliOptions: Partial<CLIOptions> = {
          dryRun: true, // Generation only, no execution
        };
        if (typeof options["plugin"] === "string") {
          cliOptions.plugin = options["plugin"];
        }
        if (typeof options["verbose"] === "boolean") {
          cliOptions.verbose = options["verbose"];
        }
        if (typeof options["semantic"] === "boolean") {
          cliOptions.semantic = options["semantic"];
        }

        const configPath =
          typeof options["config"] === "string" ? options["config"] : undefined;
        const config = loadConfigWithOverrides(configPath, cliOptions);

        // Override dry_run to false for generate command since we want to generate scenarios
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
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
