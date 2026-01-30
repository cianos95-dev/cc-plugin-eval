/**
 * Hook Detection - Detection from hook response captures.
 *
 * Provides detection methods for hooks captured via SDKHookResponseMessage
 * during execution.
 */

import type {
  HookResponseCapture,
  ProgrammaticDetection,
} from "../../../types/index.js";

/**
 * Detect hooks from hook response captures.
 *
 * Hook responses are captured via SDKHookResponseMessage during execution.
 * Only hooks with a 'success' outcome (or undefined outcome for backward
 * compatibility) are counted as triggered.
 *
 * @param hookResponses - Hook response captures from execution
 * @returns Array of programmatic detections for hooks
 *
 * @example
 * ```typescript
 * const detections = detectFromHookResponses(executionResult.hook_responses);
 * // [{ component_type: 'hook', component_name: 'PreToolUse:Write', ... }]
 * ```
 */
export function detectFromHookResponses(
  hookResponses: HookResponseCapture[],
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const response of hookResponses) {
    // Only count hooks with 'success' outcome as triggered.
    // Undefined outcome is accepted for backward compatibility with captures
    // that predate the outcome field.
    if (response.outcome !== undefined && response.outcome !== "success") {
      continue;
    }

    // Create unique component name from event type and hook name
    const componentName = response.hookName || `${response.hookEvent}:unknown`;

    detections.push({
      component_type: "hook",
      component_name: componentName,
      confidence: 100,
      tool_name: response.hookEvent,
      evidence: `Hook response: ${response.hookEvent} hook "${response.hookName}" fired${
        response.outcome !== undefined ? ` (outcome: ${response.outcome})` : ""
      }${
        response.exitCode !== undefined
          ? ` (exit code: ${String(response.exitCode)})`
          : ""
      }`,
      timestamp: response.timestamp,
    });
  }

  return detections;
}

/**
 * Check if expected hook was triggered.
 *
 * @param hookResponses - Hook response captures from execution
 * @param expectedHookName - Expected hook component name (e.g., "PreToolUse::Write|Edit")
 * @param expectedEventType - Optional expected event type
 * @returns True if expected hook was detected
 *
 * @example
 * ```typescript
 * const triggered = wasExpectedHookTriggered(
 *   executionResult.hook_responses,
 *   "PreToolUse::Write|Edit",
 *   "PreToolUse"
 * );
 * ```
 */
export function wasExpectedHookTriggered(
  hookResponses: HookResponseCapture[],
  expectedHookName: string,
  expectedEventType?: string,
): boolean {
  if (hookResponses.length === 0) {
    return false;
  }

  return hookResponses.some((response) => {
    // Match by event type if provided
    if (expectedEventType && response.hookEvent !== expectedEventType) {
      return false;
    }

    // Match by hook name
    // The expected name format is "EventType::Matcher" (e.g., "PreToolUse::Write|Edit")
    if (expectedHookName.includes("::")) {
      const [eventType, matcher] = expectedHookName.split("::");
      if (eventType && response.hookEvent !== eventType) {
        return false;
      }
      // Check if response hook name contains the matcher pattern
      if (matcher && !response.hookName.includes(matcher)) {
        return false;
      }
      return true;
    }

    // Direct name match
    return response.hookName === expectedHookName;
  });
}
