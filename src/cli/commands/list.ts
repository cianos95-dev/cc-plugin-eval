/**
 * List command - List previous runs.
 */
import { existsSync, readdirSync } from "node:fs";

import { listRuns } from "../../state/index.js";
import { logger } from "../../utils/index.js";

import type { Command } from "commander";

/**
 * Register the list command on the program.
 */
export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List previous runs")
    .option("-p, --plugin <name>", "Plugin name")
    .action((options: Record<string, unknown>) => {
      const pluginName = options["plugin"] as string | undefined;

      if (!pluginName) {
        // List all plugins and their runs
        if (!existsSync("results")) {
          logger.info("No results found");
          return;
        }

        const plugins = readdirSync("results");
        for (const plugin of plugins) {
          const runs = listRuns(plugin);
          if (runs.length > 0) {
            console.log(`\n${plugin}:`);
            for (const run of runs) {
              console.log(`  ${run.runId} - ${run.stage} (${run.timestamp})`);
            }
          }
        }
      } else {
        // List runs for specific plugin
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
    });
}
