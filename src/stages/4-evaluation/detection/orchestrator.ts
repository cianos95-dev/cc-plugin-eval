/**
 * Detection orchestration - Main detection entry points.
 *
 * Provides the main entry points for component detection, combining
 * all detection methods with proper priority ordering.
 *
 * Detection priority:
 * 1. Real-time captures from PreToolUse hooks with success status (highest confidence)
 * 2. Direct command invocation in user message (/command syntax)
 * 3. Tool calls parsed from transcript (fallback)
 */

import { detectFromSubagentCaptures } from "./agents.js";
import {
  detectFromCaptures,
  detectFromTranscript,
} from "./capture-detection.js";
import { detectDirectCommandInvocation } from "./commands.js";
import { correlateWithTranscript } from "./correlation.js";
import { getUniqueDetections } from "./helpers.js";
import { detectFromHookResponses } from "./hooks.js";

import type {
  HookResponseCapture,
  ProgrammaticDetection,
  SubagentCapture,
  TestScenario,
  ToolCapture,
  Transcript,
} from "../../../types/index.js";

/**
 * Options for detectAllComponentsWithHooks.
 */
export interface DetectAllComponentsWithHooksOptions {
  /** Tool captures from execution */
  captures: ToolCapture[];
  /** Execution transcript */
  transcript: Transcript;
  /** Test scenario */
  scenario: TestScenario;
  /** Optional hook response captures */
  hookResponses?: HookResponseCapture[];
  /** Optional subagent lifecycle captures */
  subagentCaptures?: SubagentCapture[];
}

/**
 * Detect all components using all detection methods.
 *
 * Combines real-time captures, direct command detection, and transcript
 * parsing with priority order for comprehensive detection.
 *
 * For captures without success status from PostToolUse hooks, falls back
 * to transcript correlation to determine tool success.
 *
 * Priority order:
 * 1. Real-time captures from PreToolUse hooks with success status (highest confidence)
 * 2. Direct command invocation in user message
 * 3. Tool calls parsed from transcript (fallback)
 *
 * @param captures - Tool captures from execution
 * @param transcript - Execution transcript
 * @param scenario - Test scenario
 * @returns Array of all detected components
 *
 * @example
 * ```typescript
 * const detections = detectAllComponents(
 *   executionResult.detected_tools,
 *   executionResult.transcript,
 *   testScenario
 * );
 * ```
 */
export function detectAllComponents(
  captures: ToolCapture[],
  transcript: Transcript,
  scenario: TestScenario,
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  // 1. Primary: Real-time captures (if available)
  if (captures.length > 0) {
    // Correlate with transcript for captures missing PostToolUse status
    correlateWithTranscript(captures, transcript);
    detections.push(...detectFromCaptures(captures));
  }

  // 2. Direct command detection (for /command syntax)
  if (scenario.component_type === "command") {
    const directDetection = detectDirectCommandInvocation(transcript, scenario);
    if (directDetection) {
      // Only add if not already detected via captures
      const alreadyDetected = detections.some(
        (d) =>
          d.component_type === "command" &&
          d.component_name === directDetection.component_name,
      );
      if (!alreadyDetected) {
        detections.push(directDetection);
      }
    }
  }

  // 3. Fallback: Parse transcript for tool calls
  if (detections.length === 0) {
    detections.push(...detectFromTranscript(transcript));
  }

  return detections;
}

/**
 * Detect all components including hooks and MCP servers.
 *
 * Extended version of detectAllComponents that also handles hook and MCP detection.
 *
 * @param captures - Tool captures from execution
 * @param transcript - Execution transcript
 * @param scenario - Test scenario
 * @param hookResponses - Optional hook response captures
 * @param subagentCaptures - Optional subagent lifecycle captures
 * @returns Array of all detected components including hooks, agents, and MCP servers
 */
export function detectAllComponentsWithHooks(
  options: DetectAllComponentsWithHooksOptions,
): ProgrammaticDetection[] {
  const { captures, transcript, scenario, hookResponses, subagentCaptures } =
    options;

  // Get standard component detections (now includes MCP servers)
  const detections = detectAllComponents(captures, transcript, scenario);

  // Add agent detections from SubagentStart/SubagentStop hooks (100% confidence)
  // This takes priority over Task tool parsing for agent scenarios
  if (
    scenario.component_type === "agent" &&
    subagentCaptures &&
    subagentCaptures.length > 0
  ) {
    const subagentDetections = detectFromSubagentCaptures(subagentCaptures);

    // Filter to avoid duplicate agent detections from Task tool captures
    // SubagentStart hooks provide the same info with explicit lifecycle tracking
    const existingAgentNames = new Set(
      detections
        .filter((d) => d.component_type === "agent")
        .map((d) => d.component_name),
    );

    const newSubagentDetections = subagentDetections.filter(
      (d) => !existingAgentNames.has(d.component_name),
    );

    // Prepend subagent detections to give them priority in unique detection filtering
    detections.unshift(...newSubagentDetections);
  }

  // Add hook detections if this is a hook scenario and we have responses
  if (scenario.component_type === "hook" && hookResponses) {
    const hookDetections = detectFromHookResponses(hookResponses);

    // Filter to matching hooks based on scenario
    const relevantHookDetections = hookDetections.filter((d) => {
      // Match by component reference (e.g., "PreToolUse::Write|Edit")
      const expectedRef = scenario.component_ref;
      if (!expectedRef) {
        return true;
      }

      // Parse expected reference
      if (expectedRef.includes("::")) {
        const [eventType] = expectedRef.split("::");
        return d.tool_name === eventType;
      }

      return true;
    });

    detections.push(...relevantHookDetections);
  }

  return getUniqueDetections(detections);
}
