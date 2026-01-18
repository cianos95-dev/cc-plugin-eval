#!/usr/bin/env node
/**
 * cc-plugin-eval CLI entry point.
 *
 * CRITICAL: env.js must be the FIRST import to ensure
 * environment variables are loaded before any other module.
 */
import "./env.js";

// =============================================================================
// CLI Entry Point
// =============================================================================

import { program } from "./cli/index.js";

// =============================================================================
// Public API Exports
// =============================================================================
// These exports form the public programmatic API of cc-plugin-eval.
// Import them via: import { runAnalysis } from 'cc-plugin-eval';

/** Stage 1: Analyze plugin structure and extract component triggers */
export { runAnalysis } from "./stages/1-analysis/index.js";

/** Stage 2: Generate test scenarios for components */
export { runGeneration } from "./stages/2-generation/index.js";

/** Stage 3: Execute scenarios and capture tool interactions */
export { runExecution, consoleProgress } from "./stages/3-execution/index.js";

/** Stage 4: Evaluate results and calculate metrics */
export { runEvaluation } from "./stages/4-evaluation/index.js";

/** Configuration loading with CLI overrides */
export { loadConfigWithOverrides, type CLIOptions } from "./config/index.js";

program.parse();
