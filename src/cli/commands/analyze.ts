/**
 * Analyze command - Stage 1: Plugin Analysis only.
 */

import {
  loadConfigWithOverrides,
  type CLIOptions,
} from "../../config/index.js";
import { runAnalysis } from "../../stages/1-analysis/index.js";
import { logger, writeJson, getResultsDir } from "../../utils/index.js";

import type { Command } from "commander";

/**
 * Register the analyze command on the program.
 */
export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .description("Run Stage 1: Plugin Analysis only")
    .option("-p, --plugin <path>", "Path to plugin directory")
    .option("-c, --config <path>", "Path to config file")
    .action(async (options: Record<string, unknown>) => {
      try {
        const cliOptions: Partial<CLIOptions> = {};
        if (typeof options["plugin"] === "string") {
          cliOptions.plugin = options["plugin"];
        }

        const configPath =
          typeof options["config"] === "string" ? options["config"] : undefined;
        const config = loadConfigWithOverrides(configPath, cliOptions);

        const analysis = await runAnalysis(config);

        const resultsDir = getResultsDir(analysis.plugin_name);
        writeJson(`${resultsDir}/analysis.json`, analysis);
        logger.success(`Analysis saved to ${resultsDir}/analysis.json`);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
