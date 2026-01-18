/**
 * CLI helper functions for state and result management.
 *
 * @internal CLI helpers - not part of public API
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadState } from "../state/index.js";
import { readJson } from "../utils/index.js";

/**
 * Find plugin name by searching results directories for a run ID.
 *
 * @internal CLI helper - not part of public API
 * @param runId - Run ID to search for
 * @returns Plugin name if found, null otherwise
 */
export function findPluginByRunId(runId: string): string | null {
  if (!existsSync("results")) {
    return null;
  }

  const plugins = readdirSync("results");
  for (const plugin of plugins) {
    const runPath = join("results", plugin, runId);
    if (existsSync(runPath)) {
      return plugin;
    }
  }

  return null;
}

/**
 * Find and load pipeline state.
 *
 * @internal CLI helper - not part of public API
 * @param pluginName - Optional plugin name hint
 * @param runId - Run ID to load
 * @returns Loaded state or null if not found
 */
export function findAndLoadState(
  pluginName: string | undefined,
  runId: string,
): ReturnType<typeof loadState> {
  // Try direct load if plugin name provided
  if (pluginName) {
    const state = loadState(pluginName, runId);
    if (state) {
      return state;
    }
  }

  // Search results directories
  const foundPlugin = findPluginByRunId(runId);
  if (foundPlugin) {
    return loadState(foundPlugin, runId);
  }

  return null;
}

/**
 * Evaluation file structure for report command.
 *
 * @internal CLI type - not part of public API
 */
export interface EvaluationFile {
  plugin_name: string;
  metrics: Record<string, unknown>;
  results: Record<string, unknown>[];
}

/**
 * Load and validate evaluation file.
 * Returns null if validation fails.
 *
 * @internal CLI helper - not part of public API
 */
export function loadEvaluationFile(
  evaluationPath: string,
): EvaluationFile | null {
  const rawEvaluation = readJson(evaluationPath);

  if (
    typeof rawEvaluation !== "object" ||
    rawEvaluation === null ||
    typeof (rawEvaluation as Record<string, unknown>)["plugin_name"] !==
      "string" ||
    !Array.isArray((rawEvaluation as Record<string, unknown>)["results"])
  ) {
    return null;
  }

  return rawEvaluation as EvaluationFile;
}
