/**
 * Agent SDK client for Stage 3: Execution.
 *
 * This module provides the integration with @anthropic-ai/claude-agent-sdk
 * for executing scenarios with plugins loaded.
 */

import {
  query,
  type Query,
  type Options as SDKOptions,
  type HookCallback as SDKHookCallback,
  type HookCallbackMatcher,
  type HookJSONOutput,
  type PreToolUseHookInput as SDKPreToolUseHookInput,
  type PostToolUseHookInput as SDKPostToolUseHookInput,
  type PostToolUseFailureHookInput as SDKPostToolUseFailureHookInput,
  type SubagentStartHookInput as SDKSubagentStartHookInput,
  type SubagentStopHookInput as SDKSubagentStopHookInput,
  type StopHookInput as SDKStopHookInput,
  type PermissionMode,
  type SettingSource,
  type SDKUserMessage as SDKUserMessageType,
  // Import SDK message types directly
  type SDKMessage as SDKMessageType,
  type SDKAssistantMessage as SDKAssistantMessageType,
  type SDKResultMessage as SDKResultMessageType,
  type SDKResultSuccess,
  type SDKResultError,
  type SDKSystemMessage as SDKSystemMessageType,
  type SDKPermissionDenial,
  type SDKHookResponseMessage,
  type SlashCommand,
  type AccountInfo,
  type RewindFilesResult,
  type McpServerStatus as SDKMcpServerStatus,
} from "@anthropic-ai/claude-agent-sdk";

// Import types from the types layer
import type { ModelUsage } from "../../types/transcript.js";

// Re-export types for use in other modules
export type {
  PermissionMode,
  SettingSource,
  ModelUsage,
  Query,
  HookJSONOutput,
  SlashCommand,
  AccountInfo,
  RewindFilesResult,
  SDKHookResponseMessage,
};
export type { SDKMcpServerStatus };

// Re-export the query function for use throughout Stage 3
export { query };

// Re-export SDK types directly
export type SDKUserMessage = SDKUserMessageType;
export type SDKMessage = SDKMessageType;
export type SDKAssistantMessage = SDKAssistantMessageType;
export type SDKResultMessage = SDKResultMessageType;
export type SDKSystemMessage = SDKSystemMessageType;
export type { SDKResultSuccess, SDKResultError, SDKPermissionDenial };

/**
 * SDK tool result message.
 * Note: This type is not directly exported by the SDK, so we define it here
 * based on the expected structure.
 */
export interface SDKToolResultMessage {
  type: "tool_result";
  tool_use_id: string;
  content?: string;
  is_error?: boolean;
}

/**
 * SDK error message.
 * Note: This type is not directly exported by the SDK, so we define it here
 * based on the expected structure.
 */
export interface SDKErrorMessage {
  type: "error";
  error?: string;
}

/**
 * PreToolUse hook input from SDK.
 * Re-exported for use in other modules.
 */
export type PreToolUseHookInput = SDKPreToolUseHookInput;

/**
 * PostToolUse hook input from SDK.
 * Re-exported for use in other modules.
 */
export type PostToolUseHookInput = SDKPostToolUseHookInput;

/**
 * PostToolUseFailure hook input from SDK.
 * Re-exported for use in other modules.
 */
export type PostToolUseFailureHookInput = SDKPostToolUseFailureHookInput;

/**
 * SubagentStart hook input from SDK.
 * Fired when a subagent is spawned.
 * Re-exported for use in other modules.
 */
export type SubagentStartHookInput = SDKSubagentStartHookInput;

/**
 * SubagentStop hook input from SDK.
 * Fired when a subagent completes.
 * Re-exported for use in other modules.
 */
export type SubagentStopHookInput = SDKSubagentStopHookInput;

/**
 * Stop hook input from SDK.
 * Fired when the agent finishes execution (clean completion).
 * Re-exported for use in other modules.
 */
export type StopHookInput = SDKStopHookInput;

/**
 * Hook callback signature matching Agent SDK.
 * Re-exported for use in other modules.
 */
export type HookCallback = SDKHookCallback;

/**
 * Hook configuration for PreToolUse.
 * Uses SDK's HookCallbackMatcher type.
 */
export type PreToolUseHookConfig = HookCallbackMatcher;

/**
 * Hook configuration for PostToolUse.
 * Uses SDK's HookCallbackMatcher type.
 */
export type PostToolUseHookConfig = HookCallbackMatcher;

/**
 * Hook configuration for PostToolUseFailure.
 * Uses SDK's HookCallbackMatcher type.
 */
export type PostToolUseFailureHookConfig = HookCallbackMatcher;

/**
 * Hook configuration for SubagentStart.
 * Uses SDK's HookCallbackMatcher type.
 */
export type SubagentStartHookConfig = HookCallbackMatcher;

/**
 * Hook configuration for SubagentStop.
 * Uses SDK's HookCallbackMatcher type.
 */
export type SubagentStopHookConfig = HookCallbackMatcher;

/**
 * Hook configuration for Stop.
 * Uses SDK's HookCallbackMatcher type.
 */
export type StopHookConfig = HookCallbackMatcher;

/**
 * Plugin reference for SDK options.
 */
export interface PluginReference {
  type: "local";
  path: string;
}

/**
 * Query options for the Agent SDK.
 * Derived from SDK's Options type with the subset we use.
 */
export type QueryOptions = Pick<
  SDKOptions,
  | "allowedTools"
  | "disallowedTools"
  | "model"
  | "systemPrompt"
  | "maxTurns"
  | "persistSession"
  | "continue"
  | "maxBudgetUsd"
  | "abortController"
  | "permissionMode"
  | "allowDangerouslySkipPermissions"
  | "enableFileCheckpointing"
  | "maxThinkingTokens"
  | "hooks"
  | "settingSources"
  | "stderr"
  | "forkSession"
  | "fallbackModel"
  | "sandbox"
  | "env"
  | "cwd"
  | "additionalDirectories"
  | "betas"
> & {
  plugins?: PluginReference[];
};

/**
 * Query input for the SDK.
 */
export interface QueryInput {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: QueryOptions;
}

/**
 * Type guard for user message.
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === "user" && typeof msg.message === "object";
}

/**
 * Type guard for assistant message.
 */
export function isAssistantMessage(
  msg: SDKMessage,
): msg is SDKAssistantMessage {
  return msg.type === "assistant" && typeof msg.message === "object";
}

/**
 * Type guard for tool result message.
 * Note: This message type is not part of SDK's SDKMessage union,
 * but may appear in the message stream.
 */
export function isToolResultMessage(msg: unknown): msg is SDKToolResultMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: string }).type === "tool_result" &&
    typeof (msg as { tool_use_id?: string }).tool_use_id === "string"
  );
}

/**
 * Type guard for result message.
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result";
}

/**
 * Type guard for system init message (the one with plugins).
 * The SDK has multiple system message types (init, status, hook_response, etc.),
 * but only 'init' has the plugins array we need.
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return (
    msg.type === "system" && (msg as { subtype?: string }).subtype === "init"
  );
}

/**
 * Type guard for error message.
 * Note: This message type is not part of SDK's SDKMessage union,
 * but may appear in the message stream.
 */
export function isErrorMessage(msg: unknown): msg is SDKErrorMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: string }).type === "error"
  );
}

/**
 * Extract error text from an SDK message if it's an error message.
 *
 * The SDK may send error messages that aren't part of the SDKMessage TypeScript
 * union. This helper encapsulates the type assertion needed to safely check for
 * and extract error text from such messages.
 *
 * @param msg - SDK message to check
 * @returns Error text if this is an error message, undefined otherwise
 */
export function getErrorFromMessage(msg: SDKMessage): string | undefined {
  // Type assertion needed: SDK sends error messages not in SDKMessage union
  const msgUnknown: unknown = msg;
  if (isErrorMessage(msgUnknown)) {
    return msgUnknown.error ?? "Unknown error";
  }
  return undefined;
}

/**
 * Extract message ID from an SDK message.
 *
 * All SDK message types now have `uuid: UUID` (required on most,
 * optional on `SDKUserMessage`). We read `uuid` directly.
 *
 * @param msg - SDK message to check
 * @returns Message ID if present, undefined otherwise
 */
export function getMessageId(msg: SDKMessage): string | undefined {
  // SDK messages use uuid field
  const msgRecord = msg as Record<string, unknown>;
  if (typeof msgRecord["uuid"] === "string") {
    return msgRecord["uuid"];
  }
  return undefined;
}

/**
 * Execute a query using the Agent SDK.
 *
 * This is a thin wrapper around the SDK's query function that returns
 * the Query object for both iteration and method access.
 *
 * @param input - Query input with prompt and options
 * @returns Query object for async iteration and methods
 */
export function executeQuery(input: QueryInput): Query {
  return query(input);
}

/**
 * Collect all messages from a query execution.
 *
 * @param input - Query input
 * @returns Array of all messages
 */
export async function collectQueryMessages(
  input: QueryInput,
): Promise<SDKMessage[]> {
  const messages: SDKMessage[] = [];
  const q = executeQuery(input);

  for await (const message of q) {
    messages.push(message);
  }

  return messages;
}
