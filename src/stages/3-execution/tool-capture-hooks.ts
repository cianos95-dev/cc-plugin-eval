/**
 * Shared tool capture hook creation functions.
 *
 * These functions create SDK hook callbacks for capturing tool invocations and their results.
 * The hooks use a Map<string, ToolCapture> for correlating PreToolUse with PostToolUse/PostToolUseFailure
 * events by toolUseId.
 *
 * @module tool-capture-hooks
 */

import type { HookCallback } from "./sdk-client.js";
import type { ToolCapture, SubagentCapture } from "../../types/index.js";

/**
 * Callback invoked when a new tool capture is created.
 * Used to collect captures in the caller's preferred way (array, callback, etc.).
 */
export type OnToolCapture = (capture: ToolCapture) => void;

/**
 * Creates a PreToolUse hook callback that captures tool invocation details.
 *
 * The hook:
 * 1. Creates a ToolCapture object with the tool name, input, toolUseId, and timestamp
 * 2. Calls the onCapture callback to notify the caller
 * 3. Stores the capture in the provided map for Post hook correlation (if toolUseId exists)
 *
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @param onCapture - Callback invoked with each new capture
 * @returns Hook callback function for use with the Agent SDK
 */
export function createPreToolUseHook(
  captureMap: Map<string, ToolCapture>,
  onCapture: OnToolCapture,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PreToolUse hooks receive PreToolUseHookInput which has tool_name and tool_input
    if ("tool_name" in input && "tool_input" in input) {
      const capture: ToolCapture = {
        name: input.tool_name,
        input: input.tool_input,
        toolUseId,
        timestamp: Date.now(),
      };
      onCapture(capture);

      // Store in map for Post hook correlation
      if (toolUseId) {
        captureMap.set(toolUseId, capture);
      }
    }
    // Return empty object to allow operation to proceed
    return Promise.resolve({});
  };
}

/**
 * Creates a PostToolUse hook callback that updates captures with success results.
 *
 * The hook:
 * 1. Looks up the capture from PreToolUse via toolUseId in the map
 * 2. Updates the capture with the tool response and marks success=true
 *
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @returns Hook callback function for use with the Agent SDK
 */
export function createPostToolUseHook(
  captureMap: Map<string, ToolCapture>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PostToolUse hooks receive PostToolUseHookInput with tool_response
    if (toolUseId && captureMap.has(toolUseId)) {
      const capture = captureMap.get(toolUseId);
      if (capture && "tool_response" in input) {
        capture.result = input.tool_response;
        capture.success = true;
      }
    }
    return Promise.resolve({});
  };
}

/**
 * Creates a PostToolUseFailure hook callback that updates captures with failure details.
 *
 * The hook:
 * 1. Looks up the capture from PreToolUse via toolUseId in the map
 * 2. Updates the capture with the error message and marks success=false
 * 3. Optionally sets isInterrupt if the failure was due to an interrupt
 *
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @returns Hook callback function for use with the Agent SDK
 */
export function createPostToolUseFailureHook(
  captureMap: Map<string, ToolCapture>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PostToolUseFailure hooks receive PostToolUseFailureHookInput with error
    if (toolUseId && captureMap.has(toolUseId)) {
      const capture = captureMap.get(toolUseId);
      if (capture && "error" in input) {
        // TypeScript narrows to PostToolUseFailureHookInput after "error" in input check
        capture.error = input.error;
        capture.success = false;
        if (input.is_interrupt !== undefined) {
          capture.isInterrupt = input.is_interrupt;
        }
      }
    }
    return Promise.resolve({});
  };
}

/**
 * Callback invoked when a subagent capture is created or updated.
 */
export type OnSubagentCapture = (capture: SubagentCapture) => void;

/**
 * Creates a SubagentStart hook callback that captures when subagents are spawned.
 *
 * The hook:
 * 1. Creates a SubagentCapture object with the agent ID, type, and start timestamp
 * 2. Calls the onCapture callback to notify the caller
 * 3. Stores the capture in the provided map for SubagentStop correlation (by agentId)
 *
 * @param captureMap - Map for correlating SubagentStart/SubagentStop hooks by agentId
 * @param onCapture - Callback invoked with each new capture
 * @returns Hook callback function for use with the Agent SDK
 */
export function createSubagentStartHook(
  captureMap: Map<string, SubagentCapture>,
  onCapture: OnSubagentCapture,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    // SubagentStart hooks receive SubagentStartHookInput which has agent_id and agent_type
    if ("agent_id" in input && "agent_type" in input) {
      const capture: SubagentCapture = {
        agentId: input.agent_id,
        agentType: input.agent_type,
        startTimestamp: Date.now(),
      };
      onCapture(capture);

      // Store in map for SubagentStop correlation
      captureMap.set(capture.agentId, capture);
    }
    // Return empty object to allow operation to proceed
    return Promise.resolve({});
  };
}

/**
 * Creates a SubagentStop hook callback that updates captures when subagents complete.
 *
 * The hook:
 * 1. Looks up the capture from SubagentStart via agentId in the map
 * 2. Updates the capture with stop timestamp and transcript path
 *
 * @param captureMap - Map for correlating SubagentStart/SubagentStop hooks by agentId
 * @returns Hook callback function for use with the Agent SDK
 */
export function createSubagentStopHook(
  captureMap: Map<string, SubagentCapture>,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    // SubagentStop hooks receive SubagentStopHookInput with agent_id and agent_transcript_path
    if ("agent_id" in input) {
      const agentId = input.agent_id;
      const capture = captureMap.get(agentId);
      if (capture) {
        capture.stopTimestamp = Date.now();
        if ("agent_transcript_path" in input) {
          capture.transcriptPath = input.agent_transcript_path;
        }
        if ("stop_hook_active" in input) {
          capture.stopHookActive = input.stop_hook_active;
        }
      }
    }
    return Promise.resolve({});
  };
}
