/**
 * Correlation - Correlate captures with transcript results.
 *
 * For captures where PostToolUse/PostToolUseFailure hooks didn't fire,
 * this module correlates with transcript tool_result events to determine
 * success status.
 */

import type { ToolCapture, Transcript } from "../../../types/index.js";

/**
 * Correlate captures with transcript tool results as fallback.
 *
 * For captures where PostToolUse/PostToolUseFailure hooks didn't fire
 * (success === undefined), attempt to determine success from transcript
 * tool_result events.
 *
 * **WARNING: This function mutates the captures array in place.**
 * The `result` and `success` properties of matching captures are updated.
 *
 * @param captures - Tool captures to correlate (MUTATED IN PLACE)
 * @param transcript - Execution transcript with tool results
 */
export function correlateWithTranscript(
  captures: ToolCapture[],
  transcript: Transcript,
): void {
  // Build a map of tool_use_id to tool_result for quick lookup
  const toolResultMap = new Map<
    string,
    { result: unknown; isError: boolean }
  >();

  for (const event of transcript.events) {
    if (event.type === "tool_result") {
      // TypeScript narrows to ToolResultEvent which includes is_error
      toolResultMap.set(event.tool_use_id, {
        result: event.result,
        isError: event.is_error === true,
      });
    }
  }

  // Correlate captures with transcript results
  for (const capture of captures) {
    // Only process captures without success status (no PostToolUse fired)
    if (capture.success !== undefined || !capture.toolUseId) {
      continue;
    }

    const toolResult = toolResultMap.get(capture.toolUseId);
    if (toolResult) {
      capture.result = toolResult.result;
      // If transcript has is_error field, use it; otherwise assume success
      capture.success = !toolResult.isError;
    }
  }
}
