/**
 * Report command - Generate report from existing results.
 */
import YAML from "yaml";

import { findLatestRun } from "../../state/index.js";
import { logger, getResultsDir } from "../../utils/index.js";
import { outputCLISummary, outputJUnitXML, outputTAP } from "../formatters.js";
import {
  findPluginByRunId,
  loadEvaluationFile,
  handleCLIError,
} from "../helpers.js";
import { extractReportOptions } from "../options.js";

import type { Command } from "commander";

/**
 * Register the report command on the program.
 */
export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Generate report from existing results")
    .option("-r, --run-id <id>", "Run ID to report on")
    .option("-p, --plugin <name>", "Plugin name")
    .option("-o, --output <format>", "Output format: json|yaml|junit-xml|tap")
    .option("--cli", "Output CLI summary")
    .action((options: Record<string, unknown>) => {
      try {
        // Extract and validate CLI options
        const extracted = extractReportOptions(options);
        const { pluginName, outputFormat, cliOutput } = extracted;
        let { runId } = extracted;

        // Find run if not specified
        if (!runId && pluginName) {
          runId = findLatestRun(pluginName) ?? undefined;
          if (!runId) {
            logger.error(`No runs found for plugin: ${pluginName}`);
            process.exit(1);
          }
        }

        if (!runId) {
          logger.error("Please provide --run-id or --plugin");
          process.exit(1);
        }

        // Find the plugin if not specified using helper function
        const actualPluginName = pluginName ?? findPluginByRunId(runId);

        if (!actualPluginName) {
          logger.error(`Cannot find run: ${runId}`);
          process.exit(1);
        }

        const resultsDir = getResultsDir(actualPluginName, runId);

        // Load evaluation results
        const evaluationPath = `${resultsDir}/evaluation.json`;
        const evaluation = loadEvaluationFile(evaluationPath);

        if (!evaluation) {
          logger.error(`Invalid evaluation file format: ${evaluationPath}`);
          process.exit(1);
        }

        if (cliOutput) {
          // Output CLI summary
          outputCLISummary(evaluation);
        } else if (outputFormat === "junit-xml") {
          // Output JUnit XML
          outputJUnitXML(actualPluginName, evaluation.results);
        } else if (outputFormat === "tap") {
          // Output TAP format
          outputTAP(evaluation.results);
        } else {
          // Output JSON (or YAML if requested)
          if (outputFormat === "yaml") {
            console.log(YAML.stringify(evaluation));
          } else {
            console.log(JSON.stringify(evaluation, null, 2));
          }
        }
      } catch (err) {
        handleCLIError(err);
      }
    });
}
