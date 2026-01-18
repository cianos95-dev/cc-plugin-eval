/**
 * CLI entry point and program setup.
 *
 * This module creates and configures the Commander program instance,
 * registers all commands, and exports it for use by the main entry point.
 */
import { createRequire } from "node:module";

import { Command } from "commander";

import { registerAllCommands } from "./commands/index.js";
import { configureHelpStyles } from "./styles.js";

// Get package version
const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

/**
 * Create and configure the CLI program.
 */
function createProgram(): Command {
  const program = new Command();

  // Configure styled help output (Commander v13+ feature)
  configureHelpStyles(program);

  // Set program metadata
  program
    .name("cc-plugin-eval")
    .description("Claude Code plugin component triggering evaluation framework")
    .version(packageJson.version);

  // Register all commands
  registerAllCommands(program);

  return program;
}

/**
 * The CLI program instance.
 * Import this and call `.parse()` to run the CLI.
 */
export const program = createProgram();
