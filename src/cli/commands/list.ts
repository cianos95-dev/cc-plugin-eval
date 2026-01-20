/**
 * List command - List previous runs.
 */
import { existsSync, readdirSync } from "node:fs";

import { listRuns } from "../../state/index.js";
import { logger } from "../../utils/index.js";

import type { Command } from "commander";

/** Display runs for a single plugin */
function displayPluginRuns(
  pluginName: string,
  runs: { runId: string; stage: string; timestamp: string }[],
): void {
  console.log(`\n${pluginName}:`);
  for (const run of runs) {
    console.log(`  ${run.runId} - ${run.stage} (${run.timestamp})`);
  }
}

/** List runs for all plugins */
function listAllPlugins(): void {
  if (!existsSync("results")) {
    logger.info("No results found");
    return;
  }

  const plugins = readdirSync("results");
  for (const plugin of plugins) {
    const runs = listRuns(plugin);
    if (runs.length > 0) {
      displayPluginRuns(plugin, runs);
    }
  }
}

/** List runs for a specific plugin */
function listPluginRuns(pluginName: string): void {
  const runs = listRuns(pluginName);

  if (runs.length === 0) {
    logger.info(`No runs found for plugin: ${pluginName}`);
    return;
  }

  console.log(`\nRuns for ${pluginName}:`);
  for (const run of runs) {
    console.log(`  ${run.runId} - ${run.stage} (${run.timestamp})`);
  }
}

/**
 * Register the list command on the program.
 */
export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List previous runs")
    .optionsGroup("Filter Options:")
    .option("-p, --plugin <name>", "Filter by plugin name")
    .addHelpText(
      "after",
      `
Examples:
  $ cc-plugin-eval list
  $ cc-plugin-eval list -p my-plugin
`,
    )
    .action((options: Record<string, unknown>) => {
      const pluginName = options["plugin"] as string | undefined;

      if (pluginName) {
        listPluginRuns(pluginName);
      } else {
        listAllPlugins();
      }
    });
}
