/**
 * State CRUD operations.
 *
 * Handles CRUD operations (create, save, load) and state file management.
 * All functions in this module are pure or have clearly documented side effects.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ensureDir,
  generateRunId,
  getResultsDir,
  readJson,
  writeJsonAsync,
} from "../utils/file-io.js";
import { logger } from "../utils/logging.js";

import type { CreateRunOptions, PipelineState } from "./types.js";

// Re-export generateRunId for convenience
export { generateRunId } from "../utils/file-io.js";

/**
 * Regex pattern for validating run IDs.
 * Cached at module level to avoid recompilation on every function call.
 */
const RUN_ID_PATTERN = /^\d{8}-\d{6}-/;

/**
 * Get the state file path for a run.
 *
 * @param pluginName - Plugin name
 * @param runId - Run identifier
 * @returns Path to state file
 */
export function getStateFilePath(pluginName: string, runId: string): string {
  return `results/${pluginName}/${runId}/state.json`;
}

/**
 * Create a new pipeline state.
 *
 * @param options - Creation options
 * @returns Initial pipeline state
 */
export function createPipelineState(options: CreateRunOptions): PipelineState {
  const runId = options.runId ?? generateRunId();

  return {
    run_id: runId,
    plugin_name: options.pluginName,
    stage: "pending",
    timestamp: new Date().toISOString(),
    config: options.config,
  };
}

/**
 * Save pipeline state to disk.
 *
 * Asynchronous to avoid blocking the event loop for large state files.
 *
 * @param state - Pipeline state to save
 * @returns Path to saved state file
 */
export async function saveState(state: PipelineState): Promise<string> {
  const dir = getResultsDir(state.plugin_name, state.run_id);
  ensureDir(dir);

  const filePath = getStateFilePath(state.plugin_name, state.run_id);

  // Update timestamp before saving
  const updatedState: PipelineState = {
    ...state,
    timestamp: new Date().toISOString(),
  };

  await writeJsonAsync(filePath, updatedState);
  logger.debug(`State saved to ${filePath}`);
  return filePath;
}

/**
 * Migrate state from older versions.
 *
 * Handles backward compatibility by adding default values for new fields.
 * Currently migrates:
 * - analysis.components.hooks: defaults to []
 * - analysis.trigger_understanding.hooks: defaults to {}
 *
 * @param state - Loaded state (potentially from older version)
 * @returns Migrated state with all required fields
 */
function migrateState(state: PipelineState): PipelineState {
  // If no analysis present, nothing to migrate
  if (!state.analysis) {
    return state;
  }

  // Check if migration is needed (hooks field missing from components)
  const needsMigration = !("hooks" in state.analysis.components);

  if (!needsMigration) {
    return state;
  }

  // Migrate by adding default hooks and mcp_servers fields
  // Use type assertion to handle partial legacy state
  const legacyComponents = state.analysis.components as {
    skills: typeof state.analysis.components.skills;
    agents: typeof state.analysis.components.agents;
    commands: typeof state.analysis.components.commands;
    hooks?: typeof state.analysis.components.hooks;
    mcp_servers?: typeof state.analysis.components.mcp_servers;
  };

  const legacyTriggers = state.analysis.trigger_understanding as {
    skills: typeof state.analysis.trigger_understanding.skills;
    agents: typeof state.analysis.trigger_understanding.agents;
    commands: typeof state.analysis.trigger_understanding.commands;
    hooks?: typeof state.analysis.trigger_understanding.hooks;
    mcp_servers?: typeof state.analysis.trigger_understanding.mcp_servers;
  };

  return {
    ...state,
    analysis: {
      ...state.analysis,
      components: {
        ...legacyComponents,
        hooks: legacyComponents.hooks ?? [],
        mcp_servers: legacyComponents.mcp_servers ?? [],
      },
      trigger_understanding: {
        ...legacyTriggers,
        hooks: legacyTriggers.hooks ?? {},
        mcp_servers: legacyTriggers.mcp_servers ?? {},
      },
    },
  };
}

/**
 * Load pipeline state from disk.
 *
 * Synchronous for use in resume startup operations.
 *
 * @param pluginName - Plugin name
 * @param runId - Run identifier
 * @returns Pipeline state or null if not found
 */
export function loadState(
  pluginName: string,
  runId: string,
): PipelineState | null {
  const filePath = getStateFilePath(pluginName, runId);

  try {
    const state = readJson(filePath) as PipelineState;
    logger.debug(`State loaded from ${filePath}`);
    // Migrate old state files to include hooks fields
    return migrateState(state);
  } catch {
    logger.warn(`No state found at ${filePath}`);
    return null;
  }
}

/**
 * Find the most recent run for a plugin.
 *
 * Synchronous for use in resume startup operations.
 *
 * @param pluginName - Plugin name
 * @returns Most recent run ID or null
 */
export function findLatestRun(pluginName: string): string | null {
  const pluginDir = `results/${pluginName}`;

  if (!existsSync(pluginDir)) {
    return null;
  }

  const entries = readdirSync(pluginDir, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => RUN_ID_PATTERN.test(name))
    .sort()
    .reverse();

  if (runDirs.length === 0) {
    return null;
  }

  // Return the most recent run that has a state file
  for (const runId of runDirs) {
    const statePath = join(pluginDir, runId, "state.json");
    if (existsSync(statePath)) {
      return runId;
    }
  }

  return null;
}
