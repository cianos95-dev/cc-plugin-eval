/**
 * Capture Detection - Detection from real-time tool captures.
 *
 * Provides the primary detection methods using PreToolUse hook captures
 * and transcript parsing as fallback.
 */

import { isMcpTool, parseMcpToolName } from "../../3-execution/hook-capture.js";

import { isSkillInput, isTaskInput } from "./types.js";

import type {
  ComponentType,
  ProgrammaticDetection,
  ToolCapture,
  Transcript,
} from "../../../types/index.js";

/** Common tool call structure shared between captures and transcript */
interface ToolCallLike {
  name: string;
  input: unknown;
}

/**
 * Options for createDetection.
 */
interface CreateDetectionOptions {
  componentType: ComponentType;
  componentName: string;
  toolName: string;
  evidence: string;
  timestamp: number;
}

/**
 * Create a detection from a tool call.
 */
function createDetection(
  options: CreateDetectionOptions,
): ProgrammaticDetection {
  const { componentType, componentName, toolName, evidence, timestamp } =
    options;
  return {
    component_type: componentType,
    component_name: componentName,
    confidence: 100,
    tool_name: toolName,
    evidence,
    timestamp,
  };
}

/**
 * Process a skill tool call.
 */
function processSkillTool(
  tc: ToolCallLike,
  timestamp: number,
  evidenceSuffix: string,
): ProgrammaticDetection | null {
  if (!isSkillInput(tc.input)) {
    return null;
  }
  return createDetection({
    componentType: "skill",
    componentName: tc.input.skill,
    toolName: tc.name,
    evidence: `Skill tool invoked: ${tc.input.skill}${evidenceSuffix}`,
    timestamp,
  });
}

/**
 * Process a task/agent tool call.
 */
function processTaskTool(
  tc: ToolCallLike,
  timestamp: number,
  evidenceSuffix: string,
): ProgrammaticDetection | null {
  if (!isTaskInput(tc.input)) {
    return null;
  }
  return createDetection({
    componentType: "agent",
    componentName: tc.input.subagent_type,
    toolName: tc.name,
    evidence: `Task tool invoked: ${tc.input.subagent_type}${evidenceSuffix}`,
    timestamp,
  });
}

/**
 * Process a slash command tool call.
 */
function processCommandTool(
  tc: ToolCallLike,
  timestamp: number,
  evidenceSuffix: string,
): ProgrammaticDetection | null {
  if (!isSkillInput(tc.input)) {
    return null;
  }
  return createDetection({
    componentType: "command",
    componentName: tc.input.skill,
    toolName: tc.name,
    evidence: `SlashCommand invoked: ${tc.input.skill}${evidenceSuffix}`,
    timestamp,
  });
}

/**
 * Process an MCP tool call.
 */
function processMcpTool(
  tc: ToolCallLike,
  timestamp: number,
  evidenceSuffix: string,
): ProgrammaticDetection | null {
  const parsed = parseMcpToolName(tc.name);
  if (!parsed) {
    return null;
  }
  return createDetection({
    componentType: "mcp_server",
    componentName: parsed.serverName,
    toolName: tc.name,
    evidence: `MCP tool invoked: ${tc.name} (server: ${parsed.serverName}, tool: ${parsed.toolName})${evidenceSuffix}`,
    timestamp,
  });
}

/**
 * Detect component from a single tool call.
 */
function detectFromToolCall(
  tc: ToolCallLike,
  timestamp: number,
  evidenceSuffix: string,
): ProgrammaticDetection | null {
  switch (tc.name) {
    case "Skill":
      return processSkillTool(tc, timestamp, evidenceSuffix);
    case "Task":
      return processTaskTool(tc, timestamp, evidenceSuffix);
    case "SlashCommand":
      return processCommandTool(tc, timestamp, evidenceSuffix);
    default:
      if (isMcpTool(tc.name)) {
        return processMcpTool(tc, timestamp, evidenceSuffix);
      }
      return null;
  }
}

/**
 * Detect components from real-time captures.
 *
 * Uses PreToolUse hook captures for 100% confidence detection.
 * This is the PRIMARY detection method.
 *
 * Only considers captures where the tool executed successfully.
 * Captures with `success === false` (from PostToolUseFailure hooks)
 * are skipped to avoid false positives.
 *
 * @param captures - Tool captures from execution
 * @returns Array of programmatic detections
 *
 * @example
 * ```typescript
 * const detections = detectFromCaptures(executionResult.detected_tools);
 * // [{ component_type: 'skill', component_name: 'commit', confidence: 100, ... }]
 * ```
 */
export function detectFromCaptures(
  captures: ToolCapture[],
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const capture of captures) {
    // Skip captures where tool execution explicitly failed
    if (capture.success === false) {
      continue;
    }

    const evidenceSuffix =
      capture.success === true ? " (verified successful)" : "";
    const detection = detectFromToolCall(
      capture,
      capture.timestamp,
      evidenceSuffix,
    );

    if (detection) {
      detections.push(detection);
    }
  }

  return detections;
}

/**
 * Detect components from transcript tool calls.
 *
 * Fallback method when captures are unavailable.
 * Parses assistant message tool_calls from transcript events.
 *
 * @param transcript - Execution transcript
 * @returns Array of programmatic detections
 */
export function detectFromTranscript(
  transcript: Transcript,
): ProgrammaticDetection[] {
  const detections: ProgrammaticDetection[] = [];

  for (const event of transcript.events) {
    if (event.type !== "assistant") {
      continue;
    }

    const toolCalls = event.edit.message.tool_calls ?? [];

    for (const tc of toolCalls) {
      const detection = detectFromToolCall(tc, 0, "");
      if (detection) {
        detections.push(detection);
      }
    }
  }

  return detections;
}
