/**
 * State display operations.
 *
 * Functions for formatting and listing pipeline state.
 * Used by CLI commands for user-facing output.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readJson } from "../utils/file-io.js";
import { logger } from "../utils/logging.js";

import type { PipelineStage, PipelineState } from "./types.js";

/**
 * Regex pattern for validating run IDs.
 * Cached at module level to avoid recompilation on every function call.
 */
const RUN_ID_PATTERN = /^\d{8}-\d{6}-/;

/**
 * Format state for display.
 *
 * @param state - Pipeline state
 * @returns Formatted state summary
 */
export function formatState(state: PipelineState): string {
  const lines: string[] = [
    `Run ID: ${state.run_id}`,
    `Plugin: ${state.plugin_name}`,
    `Stage: ${state.stage}`,
    `Last Updated: ${state.timestamp}`,
  ];

  if (state.analysis) {
    const componentCount =
      state.analysis.components.skills.length +
      state.analysis.components.agents.length +
      state.analysis.components.commands.length +
      state.analysis.components.hooks.length;
    lines.push(`Components: ${String(componentCount)}`);
  }

  if (state.scenarios) {
    lines.push(`Scenarios: ${String(state.scenarios.length)}`);
  }

  if (state.executions) {
    const passed = state.executions.filter((e) => e.errors.length === 0).length;
    lines.push(
      `Executions: ${String(passed)}/${String(state.executions.length)} passed`,
    );
  }

  if (state.evaluations) {
    const triggered = state.evaluations.filter((e) => e.triggered).length;
    lines.push(
      `Evaluations: ${String(triggered)}/${String(state.evaluations.length)} triggered`,
    );
  }

  if (state.failed_scenario_ids && state.failed_scenario_ids.length > 0) {
    lines.push(`Failed Scenarios: ${String(state.failed_scenario_ids.length)}`);
  }

  if (state.error) {
    lines.push(`Error: ${state.error}`);
  }

  return lines.join("\n");
}

/**
 * Run summary entry.
 */
export interface RunSummary {
  runId: string;
  stage: PipelineStage;
  timestamp: string;
}

/**
 * List all runs for a plugin.
 *
 * Synchronous for use in startup operations.
 *
 * @param pluginName - Plugin name
 * @returns Array of run summaries
 */
export function listRuns(pluginName: string): RunSummary[] {
  const pluginDir = `results/${pluginName}`;

  if (!existsSync(pluginDir)) {
    return [];
  }

  const entries = readdirSync(pluginDir, { withFileTypes: true });
  const runs: RunSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!RUN_ID_PATTERN.test(entry.name)) {
      continue;
    }

    const statePath = join(pluginDir, entry.name, "state.json");
    if (!existsSync(statePath)) {
      continue;
    }

    try {
      const state = readJson(statePath) as {
        stage?: PipelineStage;
        timestamp?: string;
      };
      runs.push({
        runId: entry.name,
        stage: state.stage ?? "pending",
        timestamp: state.timestamp ?? "",
      });
    } catch (err) {
      logger.debug(`Skipping invalid state file: ${statePath}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return runs.sort((a, b) => b.runId.localeCompare(a.runId));
}
