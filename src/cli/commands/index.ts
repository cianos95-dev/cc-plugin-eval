/**
 * CLI command registration.
 */

import { registerAnalyzeCommand } from "./analyze.js";
import { registerExecuteCommand } from "./execute.js";
import { registerGenerateCommand } from "./generate.js";
import { registerListCommand } from "./list.js";
import { registerReportCommand } from "./report.js";
import { registerResumeCommand } from "./resume.js";
import { registerRunCommand } from "./run.js";

import type { Command } from "commander";

/**
 * Register all pipeline commands on the program.
 */
export function registerPipelineCommands(program: Command): void {
  program.commandsGroup("Pipeline Commands:");
  registerRunCommand(program);
  registerAnalyzeCommand(program);
  registerGenerateCommand(program);
  registerExecuteCommand(program);
}

/**
 * Register all state management commands on the program.
 */
export function registerStateCommands(program: Command): void {
  program.commandsGroup("State Management:");
  registerResumeCommand(program);
  registerReportCommand(program);
  registerListCommand(program);
}

/**
 * Register all CLI commands on the program.
 */
export function registerAllCommands(program: Command): void {
  registerPipelineCommands(program);
  registerStateCommands(program);
}
