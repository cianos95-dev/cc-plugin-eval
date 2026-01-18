/**
 * Capture Detection - Detection from real-time tool captures.
 *
 * Provides the primary detection methods using PreToolUse hook captures
 * and transcript parsing as fallback.
 */

import { isMcpTool, parseMcpToolName } from "../../3-execution/hook-capture.js";

import { isSkillInput, isTaskInput } from "./types.js";

import type {
  ProgrammaticDetection,
  ToolCapture,
  Transcript,
} from "../../../types/index.js";

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
    // success === undefined means no PostToolUse/PostToolUseFailure was received yet (legacy behavior)
    // success === true means tool executed successfully
    // success === false means tool failed
    if (capture.success === false) {
      continue;
    }

    // Build evidence string with success status
    // At this point, capture.success is either true or undefined (false was filtered above)
    const successInfo =
      capture.success === true ? " (verified successful)" : "";

    if (capture.name === "Skill" && isSkillInput(capture.input)) {
      detections.push({
        component_type: "skill",
        component_name: capture.input.skill,
        confidence: 100,
        tool_name: capture.name,
        evidence: `Skill tool invoked: ${capture.input.skill}${successInfo}`,
        timestamp: capture.timestamp,
      });
    } else if (capture.name === "Task" && isTaskInput(capture.input)) {
      detections.push({
        component_type: "agent",
        component_name: capture.input.subagent_type,
        confidence: 100,
        tool_name: capture.name,
        evidence: `Task tool invoked: ${capture.input.subagent_type}${successInfo}`,
        timestamp: capture.timestamp,
      });
    } else if (capture.name === "SlashCommand" && isSkillInput(capture.input)) {
      // SlashCommand uses same input structure as Skill
      detections.push({
        component_type: "command",
        component_name: capture.input.skill,
        confidence: 100,
        tool_name: capture.name,
        evidence: `SlashCommand invoked: ${capture.input.skill}${successInfo}`,
        timestamp: capture.timestamp,
      });
    } else if (isMcpTool(capture.name)) {
      // MCP tool invocation (mcp__<server>__<tool> pattern)
      const parsed = parseMcpToolName(capture.name);
      if (parsed) {
        detections.push({
          component_type: "mcp_server",
          component_name: parsed.serverName,
          confidence: 100,
          tool_name: capture.name,
          evidence: `MCP tool invoked: ${capture.name} (server: ${parsed.serverName}, tool: ${parsed.toolName})${successInfo}`,
          timestamp: capture.timestamp,
        });
      }
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
    // Only assistant events have tool_calls
    if (event.type !== "assistant") {
      continue;
    }

    const toolCalls = event.edit.message.tool_calls ?? [];

    for (const tc of toolCalls) {
      if (tc.name === "Skill" && isSkillInput(tc.input)) {
        detections.push({
          component_type: "skill",
          component_name: tc.input.skill,
          confidence: 100,
          tool_name: tc.name,
          evidence: `Skill tool invoked: ${tc.input.skill}`,
          timestamp: 0, // Timestamp unavailable in transcript
        });
      } else if (tc.name === "Task" && isTaskInput(tc.input)) {
        detections.push({
          component_type: "agent",
          component_name: tc.input.subagent_type,
          confidence: 100,
          tool_name: tc.name,
          evidence: `Task tool invoked: ${tc.input.subagent_type}`,
          timestamp: 0,
        });
      } else if (tc.name === "SlashCommand" && isSkillInput(tc.input)) {
        detections.push({
          component_type: "command",
          component_name: tc.input.skill,
          confidence: 100,
          tool_name: tc.name,
          evidence: `SlashCommand invoked: ${tc.input.skill}`,
          timestamp: 0,
        });
      } else if (isMcpTool(tc.name)) {
        // MCP tool invocation from transcript
        const parsed = parseMcpToolName(tc.name);
        if (parsed) {
          detections.push({
            component_type: "mcp_server",
            component_name: parsed.serverName,
            confidence: 100,
            tool_name: tc.name,
            evidence: `MCP tool invoked: ${tc.name} (server: ${parsed.serverName}, tool: ${parsed.toolName})`,
            timestamp: 0,
          });
        }
      }
    }
  }

  return detections;
}
