/**
 * Commander help styling configuration.
 *
 * @internal CLI helper - not part of public API
 */
import chalk from "chalk";

import type { Command } from "commander";

/**
 * Configure styled help output for a Commander program.
 * Uses Commander v13+ styling features.
 *
 * @param program - Commander program instance to configure
 */
export function configureHelpStyles(program: Command): void {
  program.configureHelp({
    styleTitle: (str) => chalk.bold.cyan(str),
    styleCommandText: (str) => chalk.green(str),
    styleCommandDescription: (str) => chalk.dim(str),
    styleDescriptionText: (str) => str,
    styleOptionText: (str) => chalk.yellow(str),
    styleArgumentText: (str) => chalk.magenta(str),
    styleSubcommandText: (str) => chalk.green(str),
  });
}
