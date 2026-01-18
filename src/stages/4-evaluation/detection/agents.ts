/**
 * Agent Detection - Detection from subagent lifecycle hooks.
 *
 * Provides detection methods for agents captured via SubagentStart/SubagentStop
 * SDK hooks during execution.
 */

import type {
  ProgrammaticDetection,
  SubagentCapture,
} from "../../../types/index.js";

/**
 * Detect agents from SubagentStart/SubagentStop hook captures.
 *
 * This provides 100% confidence agent detection directly from SDK hooks,
 * as an alternative to parsing Task tool inputs.
 *
 * @param subagentCaptures - Subagent lifecycle captures from SDK hooks
 * @returns Array of programmatic detections for agents
 *
 * @example
 * ```typescript
 * const detections = detectFromSubagentCaptures(executionResult.subagent_captures);
 * // Returns detections with component_type: "agent", component_name: "Explore"
 * ```
 */
export function detectFromSubagentCaptures(
  subagentCaptures: SubagentCapture[],
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const capture of subagentCaptures) {
    // Build evidence string with lifecycle info
    const lifecycleInfo =
      capture.stopTimestamp !== undefined
        ? ` (completed in ${String(capture.stopTimestamp - capture.startTimestamp)}ms)`
        : " (started)";

    detections.push({
      component_type: "agent",
      component_name: capture.agentType,
      confidence: 100,
      tool_name: "SubagentStart",
      evidence: `Subagent hook fired: ${capture.agentType} (id: ${capture.agentId})${lifecycleInfo}`,
      timestamp: capture.startTimestamp,
    });
  }

  return detections;
}
