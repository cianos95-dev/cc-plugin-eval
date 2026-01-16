/**
 * Agent SDK client for Stage 3: Execution.
 *
 * This module provides the integration with @anthropic-ai/claude-agent-sdk
 * for executing scenarios with plugins loaded.
 */

import {
  query,
  type HookCallback as SDKHookCallback,
  type HookCallbackMatcher,
  type PreToolUseHookInput as SDKPreToolUseHookInput,
  type PostToolUseHookInput as SDKPostToolUseHookInput,
  type PostToolUseFailureHookInput as SDKPostToolUseFailureHookInput,
  type SubagentStartHookInput as SDKSubagentStartHookInput,
  type SubagentStopHookInput as SDKSubagentStopHookInput,
  type PermissionMode,
  type SettingSource,
  type SDKUserMessage as SDKUserMessageType,
} from "@anthropic-ai/claude-agent-sdk";

// Import types from the types layer
import type { ModelUsage } from "../../types/transcript.js";

// Re-export types for use in other modules
export type { PermissionMode, SettingSource, ModelUsage };

// Re-export the query function for use throughout Stage 3
export { query };

// Re-export SDK types
export type SDKUserMessage = SDKUserMessageType;

// Re-export types from the SDK
// Note: The SDK may not export all types, so we define compatible interfaces
// for types that aren't exported.

/**
 * SDK message base type.
 */
export interface SDKMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * SDK assistant message.
 */
export interface SDKAssistantMessage extends SDKMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: {
      type: "text" | "tool_use";
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }[];
  };
}

/**
 * SDK tool result message.
 */
export interface SDKToolResultMessage extends SDKMessage {
  type: "tool_result";
  tool_use_id: string;
  content?: string;
  is_error?: boolean;
}

/**
 * SDK result message with metrics.
 */
export interface SDKResultMessage extends SDKMessage {
  type: "result";
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  permission_denials?: string[];
  /** Per-model usage breakdown. Keys are model IDs. */
  modelUsage?: Record<string, ModelUsage>;
}

/**
 * SDK system init message.
 */
export interface SDKSystemMessage extends SDKMessage {
  type: "system";
  subtype?: "init";
  session_id?: string;
  tools?: string[];
  slash_commands?: string[];
  plugins?: {
    name: string;
    path: string;
  }[];
  mcp_servers?: {
    name: string;
    status: string;
    error?: string;
  }[];
}

/**
 * SDK error message.
 */
export interface SDKErrorMessage extends SDKMessage {
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
 * Hook JSON output - return value from hooks.
 */
export interface HookJSONOutput {
  decision?: "allow" | "deny";
  reason?: string;
}

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
 * Plugin reference for SDK options.
 */
export interface PluginReference {
  type: "local";
  path: string;
}

/**
 * System prompt configuration type.
 * Can be a raw string or a preset configuration object.
 */
export type SystemPromptConfig =
  | string
  | {
      type: "preset";
      preset: "claude_code";
      append?: string;
    };

/**
 * Query options for the Agent SDK.
 */
export interface QueryOptions {
  plugins?: PluginReference[];
  settingSources?: SettingSource[];
  allowedTools?: string[];
  disallowedTools?: string[];
  model?: string;
  /** System prompt configuration. Use Claude Code preset for plugin evaluation. */
  systemPrompt?: SystemPromptConfig;
  maxTurns?: number;
  persistSession?: boolean;
  continue?: boolean;
  maxBudgetUsd?: number;
  abortController?: AbortController;
  permissionMode?: PermissionMode;
  allowDangerouslySkipPermissions?: boolean;
  enableFileCheckpointing?: boolean;
  /** Limit extended thinking tokens to reduce cost. */
  maxThinkingTokens?: number;
  hooks?: {
    PreToolUse?: HookCallbackMatcher[];
    PostToolUse?: HookCallbackMatcher[];
    PostToolUseFailure?: HookCallbackMatcher[];
    SubagentStart?: HookCallbackMatcher[];
    SubagentStop?: HookCallbackMatcher[];
  };
  stderr?: (data: string) => void;
}

/**
 * Query input for the SDK.
 */
export interface QueryInput {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: QueryOptions;
}

/**
 * The Query object returned by query() - provides iteration and methods.
 * This is an async iterable that also has methods like rewindFiles().
 */
export interface QueryObject extends AsyncIterable<SDKMessage> {
  /**
   * Rewind files to state before a given message.
   * Only available when enableFileCheckpointing is true.
   */
  rewindFiles?(messageId: string): Promise<void>;

  /**
   * Get supported slash commands.
   */
  supportedCommands?(): Promise<string[]>;

  /**
   * Get MCP server status.
   */
  mcpServerStatus?(): Promise<
    Record<string, { status: string; tools: string[] }>
  >;

  /**
   * Get account info.
   */
  accountInfo?(): Promise<{ tier: string }>;
}

/**
 * Type guard for user message.
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === "user" && typeof msg["message"] === "object";
}

/**
 * Type guard for assistant message.
 */
export function isAssistantMessage(
  msg: SDKMessage,
): msg is SDKAssistantMessage {
  return msg.type === "assistant" && typeof msg["message"] === "object";
}

/**
 * Type guard for tool result message.
 */
export function isToolResultMessage(
  msg: SDKMessage,
): msg is SDKToolResultMessage {
  return msg.type === "tool_result" && typeof msg["tool_use_id"] === "string";
}

/**
 * Type guard for result message.
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result";
}

/**
 * Type guard for system message.
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === "system";
}

/**
 * Type guard for error message.
 */
export function isErrorMessage(msg: SDKMessage): msg is SDKErrorMessage {
  return msg.type === "error";
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
export function executeQuery(input: QueryInput): QueryObject {
  // The SDK's query() returns an async iterable that may also have methods
  // Cast to our QueryObject interface which extends AsyncIterable
  return query(input) as unknown as QueryObject;
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
