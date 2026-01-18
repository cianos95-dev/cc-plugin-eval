/**
 * Shared formatting functions for progress reporters.
 *
 * These functions provide consistent formatting logic used by
 * consoleProgress, verboseProgress, and createSanitizedVerboseProgress,
 * eliminating code duplication across progress reporters.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";

import type { ExecutionResult } from "../../types/index.js";

/**
 * Sanitizer function type for optional text sanitization.
 */
export type SanitizerFn = (text: string) => string;

/**
 * Minimal scenario info needed for formatting.
 */
export interface ScenarioInfo {
  id: string;
  component_type: string;
  expected_trigger: boolean;
  prompt: string;
}

/**
 * Format and output stage header.
 *
 * Outputs a separator line, stage name in uppercase with item count,
 * and another separator line.
 *
 * @param stage - The stage name (e.g., "execution", "generation")
 * @param total - Total number of items in this stage
 */
export function formatStageHeader(stage: string, total: number): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`STAGE: ${stage.toUpperCase()} (${String(total)} items)`);
  console.log("=".repeat(60));
}

/**
 * Format and output stage completion message.
 *
 * @param stage - The stage name
 * @param durationMs - Duration in milliseconds
 * @param count - Number of items processed
 */
export function formatStageComplete(
  stage: string,
  durationMs: number,
  count: number,
): void {
  const durationSec = (durationMs / 1000).toFixed(1);
  console.log(
    `\n✅ ${stage} complete: ${String(count)} items in ${durationSec}s`,
  );
}

/**
 * Format and output error message.
 *
 * @param error - The error that occurred
 * @param scenarioId - Optional scenario ID for context
 */
export function formatError(error: Error, scenarioId?: string): void {
  const scenarioInfo = scenarioId ? ` in ${scenarioId}` : "";
  console.error(`\n❌ Error${scenarioInfo}: ${error.message}`);
}

/**
 * Format and output scenario start information.
 *
 * @param scenario - Scenario information
 * @param index - Zero-based index of current scenario
 * @param total - Total number of scenarios
 * @param sanitize - Optional sanitizer function for prompt
 */
export function formatScenarioStart(
  scenario: ScenarioInfo,
  index: number,
  total: number,
  sanitize?: SanitizerFn,
): void {
  console.log(
    `\n[${String(index + 1)}/${String(total)}] Starting: ${scenario.id}`,
  );
  console.log(
    `  Type: ${scenario.component_type} | Expected: ${scenario.expected_trigger ? "trigger" : "no trigger"}`,
  );

  // Truncate prompt if too long
  const truncatedPrompt = truncatePrompt(scenario.prompt);

  // Apply sanitizer if provided
  const displayPrompt = sanitize ? sanitize(truncatedPrompt) : truncatedPrompt;
  console.log(`  Prompt: ${displayPrompt}`);
}

/**
 * Format and output scenario result information.
 *
 * @param result - Execution result
 * @param sanitize - Optional sanitizer function for sensitive data
 */
export function formatScenarioResult(
  result: ExecutionResult,
  sanitize?: SanitizerFn,
): void {
  const status = result.errors.length > 0 ? "❌ FAILED" : "✅ PASSED";
  console.log(
    `  Result: ${status} | Cost: $${result.cost_usd.toFixed(4)} | Duration: ${String(result.api_duration_ms)}ms`,
  );

  if (result.detected_tools.length > 0) {
    const toolNames = result.detected_tools.map((t) => t.name).join(", ");
    console.log(`  Detected: ${toolNames}`);
  }

  if (result.permission_denials.length > 0) {
    const denialNames = result.permission_denials
      .map((d) => (sanitize ? sanitize(d.tool_name) : d.tool_name))
      .join(", ");
    console.log(`  Denials: ${denialNames}`);
  }
}

/**
 * Truncate a prompt to the configured maximum display length.
 *
 * @param prompt - The prompt text to truncate
 * @param maxLength - Maximum length (defaults to config value)
 * @returns Truncated prompt with ellipsis if needed
 */
export function truncatePrompt(
  prompt: string,
  maxLength: number = DEFAULT_TUNING.limits.prompt_display_length,
): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  return `${prompt.slice(0, maxLength)}...`;
}
