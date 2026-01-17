/**
 * Factory for creating SDK hook configurations used in scenario execution.
 *
 * This module centralizes the creation of capture hooks for tool and subagent tracking,
 * ensuring consistency between agent-executor.ts and session-batching.ts.
 *
 * @module hooks-factory
 */

import {
  createPreToolUseHook,
  createPostToolUseHook,
  createPostToolUseFailureHook,
  createSubagentStartHook,
  createSubagentStopHook,
  type OnToolCapture,
  type OnSubagentCapture,
} from "./tool-capture-hooks.js";

import type {
  PreToolUseHookConfig,
  PostToolUseHookConfig,
  PostToolUseFailureHookConfig,
  SubagentStartHookConfig,
  SubagentStopHookConfig,
} from "./sdk-client.js";
import type { ToolCapture, SubagentCapture } from "../../types/index.js";

/**
 * SDK-compatible hooks configuration with PascalCase event type keys.
 * This matches the format expected by the Agent SDK's query options.
 */
export interface SDKHooksConfig {
  PreToolUse: PreToolUseHookConfig[];
  PostToolUse: PostToolUseHookConfig[];
  PostToolUseFailure: PostToolUseFailureHookConfig[];
  SubagentStart: SubagentStartHookConfig[];
  SubagentStop: SubagentStopHookConfig[];
}

/**
 * Options for creating capture hooks configuration.
 */
export interface CaptureHooksOptions {
  /** Map for correlating PreToolUse with PostToolUse/PostToolUseFailure events */
  captureMap: Map<string, ToolCapture>;
  /** Callback invoked when a tool is captured */
  onToolCapture: OnToolCapture;
  /** Map for correlating SubagentStart with SubagentStop events */
  subagentCaptureMap: Map<string, SubagentCapture>;
  /** Callback invoked when a subagent is captured */
  onSubagentCapture: OnSubagentCapture;
}

/**
 * Creates an SDK-compatible hooks configuration for capturing tool and subagent invocations.
 *
 * This factory centralizes the hook setup that was previously duplicated in:
 * - agent-executor.ts (executeScenario, executeScenarioWithCheckpoint)
 * - session-batching.ts (buildScenarioQueryInput)
 *
 * All hooks use ".*" as the matcher to capture all tool invocations.
 *
 * @param options - Configuration options for the capture hooks
 * @returns SDK-compatible hooks configuration with PascalCase keys
 *
 * @example
 * ```typescript
 * const captureMap = new Map<string, ToolCapture>();
 * const subagentCaptureMap = new Map<string, SubagentCapture>();
 * const detectedTools: ToolCapture[] = [];
 * const subagentCaptures: SubagentCapture[] = [];
 *
 * const hooks = createCaptureHooksConfig({
 *   captureMap,
 *   onToolCapture: (capture) => detectedTools.push(capture),
 *   subagentCaptureMap,
 *   onSubagentCapture: (capture) => subagentCaptures.push(capture),
 * });
 *
 * const queryInput = {
 *   prompt: scenario.user_prompt,
 *   options: { hooks }
 * };
 * ```
 */
export function createCaptureHooksConfig(
  options: CaptureHooksOptions,
): SDKHooksConfig {
  const { captureMap, onToolCapture, subagentCaptureMap, onSubagentCapture } =
    options;

  return {
    PreToolUse: [
      {
        matcher: ".*",
        hooks: [createPreToolUseHook(captureMap, onToolCapture)],
      },
    ],
    PostToolUse: [
      {
        matcher: ".*",
        hooks: [createPostToolUseHook(captureMap)],
      },
    ],
    PostToolUseFailure: [
      {
        matcher: ".*",
        hooks: [createPostToolUseFailureHook(captureMap)],
      },
    ],
    SubagentStart: [
      {
        matcher: ".*",
        hooks: [createSubagentStartHook(subagentCaptureMap, onSubagentCapture)],
      },
    ],
    SubagentStop: [
      {
        matcher: ".*",
        hooks: [createSubagentStopHook(subagentCaptureMap)],
      },
    ],
  };
}
