/**
 * Shared tool capture hook creation functions.
 *
 * These functions create SDK hook callbacks for capturing tool invocations and their results.
 * The hooks use a Map<string, ToolCapture> for correlating PreToolUse with PostToolUse/PostToolUseFailure
 * events by toolUseId.
 *
 * @module tool-capture-hooks
 */

import type {
  HookCallback,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
  StopHookInput,
} from "./sdk-client.js";
import type { ToolCapture, SubagentCapture } from "../../types/index.js";

/**
 * Type guard for PreToolUseHookInput.
 * Validates the input has the expected shape with tool_name and tool_input.
 */
function isPreToolUseInput(input: unknown): input is PreToolUseHookInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "tool_name" in input &&
    typeof (input as PreToolUseHookInput).tool_name === "string" &&
    "tool_input" in input
  );
}

/**
 * Type guard for PostToolUseHookInput.
 * Validates the input has the expected shape with tool_response.
 */
function isPostToolUseInput(input: unknown): input is PostToolUseHookInput {
  return (
    typeof input === "object" && input !== null && "tool_response" in input
  );
}

/**
 * Type guard for PostToolUseFailureHookInput.
 * Validates the input has the expected shape with error.
 */
function isPostToolUseFailureInput(
  input: unknown,
): input is PostToolUseFailureHookInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "error" in input &&
    typeof (input as PostToolUseFailureHookInput).error === "string"
  );
}

/**
 * Type guard for SubagentStartHookInput.
 * Validates the input has the expected shape with agent_id and agent_type.
 */
function isSubagentStartInput(input: unknown): input is SubagentStartHookInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "agent_id" in input &&
    typeof (input as SubagentStartHookInput).agent_id === "string" &&
    "agent_type" in input &&
    typeof (input as SubagentStartHookInput).agent_type === "string"
  );
}

/**
 * Type guard for SubagentStopHookInput.
 * Validates the input has the expected shape with agent_id.
 */
function isSubagentStopInput(input: unknown): input is SubagentStopHookInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "agent_id" in input &&
    typeof (input as SubagentStopHookInput).agent_id === "string"
  );
}

/**
 * Type guard for StopHookInput.
 * Validates the input has the expected shape with hook_event_name === "Stop".
 */
function isStopInput(input: unknown): input is StopHookInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "hook_event_name" in input &&
    (input as { hook_event_name: string }).hook_event_name === "Stop"
  );
}

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
    if (isPreToolUseInput(input)) {
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
    if (toolUseId && captureMap.has(toolUseId) && isPostToolUseInput(input)) {
      const capture = captureMap.get(toolUseId);
      if (capture) {
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
    if (
      toolUseId &&
      captureMap.has(toolUseId) &&
      isPostToolUseFailureInput(input)
    ) {
      const capture = captureMap.get(toolUseId);
      if (capture) {
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
    if (isSubagentStartInput(input)) {
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
    if (isSubagentStopInput(input)) {
      const capture = captureMap.get(input.agent_id);
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

/**
 * Creates a Stop hook callback that updates captures when a stop event occurs.
 *
 * The hook:
 * 1. Looks up the capture from PreToolUse via toolUseId in the map
 * 2. Updates the capture with stop timestamp and reason
 *
 * @param captureMap - Map for correlating PreToolUse/Stop hooks by toolUseId
 * @returns Hook callback function for use with the Agent SDK
 */
/**
 * Callback invoked when the Stop hook fires (agent completed cleanly).
 */
export type OnStopCapture = () => void;

/**
 * Creates a Stop hook callback that signals clean agent completion.
 *
 * The hook:
 * 1. Validates the input is a Stop event
 * 2. Calls the onStop callback to signal clean termination
 *
 * This is a stateless hook — it simply sets a flag, no per-scenario
 * state is needed.
 *
 * @param onStop - Callback invoked when the agent stops cleanly
 * @returns Hook callback function for use with the Agent SDK
 */
export function createStopHook(onStop: OnStopCapture): HookCallback {
  return async (input, _toolUseId, _context) => {
    if (isStopInput(input)) {
      onStop();
    }
    return Promise.resolve({});
  };
}
